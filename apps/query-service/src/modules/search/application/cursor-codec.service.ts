import * as crypto from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { QueryConfigService } from '../../../config/query-config.service.js';
import { QueryAuditService } from '../../audit/query-audit.service.js';
import type { StableCursorPosition } from '../../query-execution/domain/authorized-query-plan.model.js';
import type { InternalCursorPayload } from '../domain/cursor-payload.model.js';
import {
  InvalidCursorException,
  CursorScopeMismatchException,
} from '../../../common/errors/query.errors.js';

export interface EncodeCursorParams {
  readonly position: StableCursorPosition;
  readonly sortDirection: 'asc' | 'desc';
  readonly queryFingerprint: string;
  readonly tenantId: string;
}

export interface DecodeCursorParams {
  readonly encodedCursor: string;
  readonly expectedTenantId: string;
  readonly expectedQueryFingerprint: string;
  readonly expectedSortDirection: 'asc' | 'desc';
  readonly correlationId?: string;
  readonly principalId?: string;
}

@Injectable()
export class CursorCodecService {
  private readonly logger = new Logger(CursorCodecService.name);

  constructor(
    private readonly config: QueryConfigService,
    private readonly audit: QueryAuditService,
  ) {}

  /**
   * Computes a deterministic SHA-256 query fingerprint from search parameters.
   */
  public computeQueryFingerprint(params: {
    readonly time_range: { readonly start: string; readonly end: string };
    readonly projects?: readonly string[];
    readonly environments?: readonly string[];
    readonly services?: readonly string[];
    readonly levels?: readonly string[];
    readonly query_text?: string;
    readonly trace_id?: string;
    readonly event_id?: string;
    readonly filters?: readonly { readonly field: string; readonly operator: string; readonly value?: unknown }[];
    readonly sort_direction?: string;
  }): string {
    const canonicalObject = {
      t_start: params.time_range.start,
      t_end: params.time_range.end,
      projects: params.projects ? [...params.projects].sort() : [],
      environments: params.environments ? [...params.environments].sort() : [],
      services: params.services ? [...params.services].sort() : [],
      levels: params.levels ? [...params.levels].sort() : [],
      query_text: params.query_text ? params.query_text.trim() : '',
      trace_id: params.trace_id ? params.trace_id.trim() : '',
      event_id: params.event_id ? params.event_id.trim() : '',
      filters: params.filters
        ? [...params.filters]
            .map((f) => ({
              field: f.field,
              operator: f.operator,
              value: f.value,
            }))
            .sort((a, b) => a.field.localeCompare(b.field))
        : [],
      sort_direction: params.sort_direction ?? 'desc',
    };

    return crypto
      .createHash('sha256')
      .update(JSON.stringify(canonicalObject))
      .digest('hex');
  }

  /**
   * Encodes a stable result position into a tamper-evident, signed base64url cursor.
   */
  public encode(params: EncodeCursorParams): string {
    const createdAt = Date.now();
    const signature = this.computeSignature({
      version: '1.0',
      tenantId: params.tenantId,
      queryFingerprint: params.queryFingerprint,
      sortDirection: params.sortDirection,
      timestamp: params.position.timestamp,
      eventId: params.position.eventId,
      segmentId: params.position.segmentId,
      recordOffset: params.position.recordOffset,
      createdAt,
    });

    const payload: InternalCursorPayload = {
      cursor_version: '1.0',
      timestamp: params.position.timestamp,
      event_id: params.position.eventId,
      segment_id: params.position.segmentId,
      record_offset: params.position.recordOffset,
      sort_direction: params.sortDirection,
      query_fingerprint: params.queryFingerprint,
      tenant_id: params.tenantId,
      created_at: createdAt,
      signature,
    };

    return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  }

  /**
   * Decodes, verifies signature and validates constraints on an incoming cursor.
   */
  public decode(params: DecodeCursorParams): StableCursorPosition {
    let rawPayload: unknown;
    try {
      const decodedJson = Buffer.from(params.encodedCursor, 'base64url').toString('utf8');
      rawPayload = JSON.parse(decodedJson);
    } catch {
      this.recordSecurityViolation(params, 'Malformed cursor base64url or JSON payload');
      throw new InvalidCursorException('Malformed pagination cursor encoding.');
    }

    if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) {
      this.recordSecurityViolation(params, 'Cursor JSON root must be an object');
      throw new InvalidCursorException('Malformed pagination cursor structure.');
    }

    const payload = rawPayload as Partial<InternalCursorPayload>;

    // 1. Version check
    if (payload.cursor_version !== '1.0') {
      this.recordSecurityViolation(params, `Unsupported cursor version "${payload.cursor_version}"`);
      throw new InvalidCursorException('Unsupported cursor version.');
    }

    // 2. Required fields presence
    if (
      !payload.timestamp ||
      !payload.event_id ||
      !payload.segment_id ||
      typeof payload.record_offset !== 'number' ||
      !payload.sort_direction ||
      !payload.query_fingerprint ||
      !payload.tenant_id ||
      typeof payload.created_at !== 'number' ||
      !payload.signature
    ) {
      this.recordSecurityViolation(params, 'Missing required cursor fields');
      throw new InvalidCursorException('Cursor envelope is missing required fields.');
    }

    // 3. Constant-time MAC comparison (reject tampering)
    const expectedSignature = this.computeSignature({
      version: payload.cursor_version,
      tenantId: payload.tenant_id,
      queryFingerprint: payload.query_fingerprint,
      sortDirection: payload.sort_direction,
      timestamp: payload.timestamp,
      eventId: payload.event_id,
      segmentId: payload.segment_id,
      recordOffset: payload.record_offset,
      createdAt: payload.created_at,
    });

    try {
      const actualSigBuf = Buffer.from(payload.signature, 'hex');
      const expectedSigBuf = Buffer.from(expectedSignature, 'hex');

      if (
        actualSigBuf.length !== expectedSigBuf.length ||
        !crypto.timingSafeEqual(actualSigBuf, expectedSigBuf)
      ) {
        this.recordSecurityViolation(params, 'HMAC signature verification failed');
        throw new InvalidCursorException('Pagination cursor signature verification failed: tampered cursor.');
      }
    } catch (err: unknown) {
      if (err instanceof InvalidCursorException) throw err;
      this.recordSecurityViolation(params, 'HMAC comparison error');
      throw new InvalidCursorException('Pagination cursor signature comparison failure.');
    }

    // 4. Tenant isolation boundary check
    if (payload.tenant_id !== params.expectedTenantId) {
      this.recordSecurityViolation(
        params,
        `Cursor tenant "${payload.tenant_id}" does not match caller tenant "${params.expectedTenantId}"`,
      );
      throw new CursorScopeMismatchException(
        'Cross-tenant pagination attempt rejected: cursor bound to a different tenant.',
      );
    }

    // 5. Expiration check
    const now = Date.now();
    const ageMs = now - payload.created_at;
    if (ageMs > this.config.cursorTtlMs || ageMs < -60000) {
      throw new InvalidCursorException('Pagination cursor has expired.');
    }

    // 6. Query fingerprint binding check (filters/projects/time cannot change across pages)
    if (payload.query_fingerprint !== params.expectedQueryFingerprint) {
      this.recordSecurityViolation(params, 'Query fingerprint mismatch with cursor');
      throw new InvalidCursorException(
        'Pagination cursor cannot be reused: search query parameters do not match initial cursor query.',
      );
    }

    // 7. Sort direction binding check
    if (payload.sort_direction !== params.expectedSortDirection) {
      throw new InvalidCursorException(
        'Sort direction does not match the sort direction bound to this pagination cursor.',
      );
    }

    return {
      timestamp: payload.timestamp,
      eventId: payload.event_id,
      segmentId: payload.segment_id,
      recordOffset: payload.record_offset,
    };
  }

  private computeSignature(data: {
    version: string;
    tenantId: string;
    queryFingerprint: string;
    sortDirection: string;
    timestamp: string;
    eventId: string;
    segmentId: string;
    recordOffset: number;
    createdAt: number;
  }): string {
    const canonicalString = `${data.version}:${data.tenantId}:${data.queryFingerprint}:${data.sortDirection}:${data.timestamp}:${data.eventId}:${data.segmentId}:${data.recordOffset}:${data.createdAt}`;
    return crypto
      .createHmac('sha256', this.config.cursorSigningSecret)
      .update(canonicalString)
      .digest('hex');
  }

  private recordSecurityViolation(params: DecodeCursorParams, reason: string): void {
    this.audit.recordSecurityEvent({
      eventType: 'CURSOR_TAMPERED',
      principalId: params.principalId ?? 'anonymous',
      tenantId: params.expectedTenantId,
      correlationId: params.correlationId,
      detail: `Pagination cursor security rejection: ${reason}`,
    });
  }
}
