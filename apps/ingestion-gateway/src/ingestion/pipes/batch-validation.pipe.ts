import { Injectable, type PipeTransform, type ArgumentMetadata, HttpStatus } from '@nestjs/common';
import * as crypto from 'node:crypto';
import { validateLogEvent } from '@skyra/logger-core';
import { GatewayException } from '../../common/types/gateway-exception.js';
import { ErrorCode } from '../../common/types/error-code.enum.js';
import { ConfigService } from '../../config/config.service.js';
import type { IngestionBatchRequestDto, NormalizedBatch } from '../dto/batch-request.dto.js';

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

@Injectable()
export class BatchValidationPipe implements PipeTransform<unknown, NormalizedBatch> {
  constructor(private readonly config: ConfigService) {}

  public transform(value: unknown, metadata?: ArgumentMetadata): NormalizedBatch {
    if (metadata && metadata.type !== 'body') {
      return value as any;
    }

    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new GatewayException(
        ErrorCode.SCHEMA_VALIDATION_FAILED,
        'Request body must be a valid JSON object representing a batch envelope',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const dto = value as IngestionBatchRequestDto;
    const isLegacy = !dto.protocol_version;

    // 1. Protocol version validation
    if (!isLegacy && dto.protocol_version !== '1.0') {
      throw new GatewayException(
        ErrorCode.UNSUPPORTED_PROTOCOL_VERSION,
        `Unsupported protocol version "${dto.protocol_version}". Authoritative protocol version is "1.0"`,
        HttpStatus.BAD_REQUEST,
      );
    }

    // 2. Sent at validation
    if (!dto.sent_at || typeof dto.sent_at !== 'string' || !ISO_DATE_REGEX.test(dto.sent_at) || Number.isNaN(Date.parse(dto.sent_at))) {
      throw new GatewayException(
        ErrorCode.SCHEMA_VALIDATION_FAILED,
        'sent_at must be a valid ISO 8601 UTC timestamp',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    // 3. Events array validation
    if (!Array.isArray(dto.events) || dto.events.length === 0) {
      throw new GatewayException(
        ErrorCode.BATCH_EMPTY,
        'Batch must contain at least one log event in the "events" array',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    if (dto.events.length > this.config.maxBatchSize) {
      throw new GatewayException(
        ErrorCode.BATCH_OVERSIZED,
        `Batch exceeds maximum allowed events (${dto.events.length} > ${this.config.maxBatchSize})`,
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    }

    // 4. Compute batch content digest
    const contentDigestSha256 = crypto
      .createHash('sha256')
      .update(JSON.stringify(dto.events))
      .digest('hex');

    // 5. Batch ID validation or deterministic derivation (ADR-015 Scenario 10)
    let batchId: string;
    if (dto.batch_id) {
      if (!UUID_V4_REGEX.test(dto.batch_id) && !dto.batch_id.startsWith('urn:skyra:legacy:')) {
        throw new GatewayException(
          ErrorCode.SCHEMA_VALIDATION_FAILED,
          `batch_id "${dto.batch_id}" is not a valid UUIDv4 or legacy URN`,
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
      batchId = dto.batch_id;
    } else {
      // Legacy envelope: derive deterministic synthetic UUID from content digest
      const h = crypto.createHash('sha256').update(`skyra:legacy:${contentDigestSha256}`).digest('hex');
      batchId = `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
    }

    // 5. Intra-batch duplicate event ID detection and canonical validation
    const seenEventIds = new Set<string>();

    for (let i = 0; i < dto.events.length; i++) {
      const rawEvent = dto.events[i];
      if (!rawEvent || typeof rawEvent !== 'object' || Array.isArray(rawEvent)) {
        throw new GatewayException(
          ErrorCode.SCHEMA_VALIDATION_FAILED,
          `Event at index ${i} is not a valid JSON object`,
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }

      // Check event ID
      const eventId = (rawEvent as any).event?.id ?? (rawEvent as any).id;
      if (typeof eventId === 'string' && eventId.length > 0) {
        if (seenEventIds.has(eventId)) {
          throw new GatewayException(
            ErrorCode.SCHEMA_VALIDATION_FAILED,
            `Duplicate event ID "${eventId}" found within the same batch at index ${i}`,
            HttpStatus.UNPROCESSABLE_ENTITY,
          );
        }
        seenEventIds.add(eventId);
      }

      // Validate against canonical ECS Log Event schema v1
      const validationResult = validateLogEvent(rawEvent);
      if (!validationResult.valid) {
        throw new GatewayException(
          ErrorCode.SCHEMA_VALIDATION_FAILED,
          `Event at index ${i} failed canonical schema validation: ${validationResult.errors[0]?.message ?? 'invalid schema'}`,
          HttpStatus.UNPROCESSABLE_ENTITY,
          {
            details: validationResult.errors,
          },
        );
      }
    }

    return {
      protocol_version: '1.0',
      batch_id: batchId,
      sent_at: dto.sent_at,
      events: dto.events as Record<string, any>[],
      isLegacyEnvelope: isLegacy,
      contentDigestSha256,
    };
  }
}
