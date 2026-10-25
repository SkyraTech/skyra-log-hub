import { Injectable, HttpStatus, Logger, Optional } from '@nestjs/common';
import { ProjectService } from '../projects/project.service.js';
import { DiagnosticsService } from '../observability/diagnostics.service.js';
import { GatewayException } from '../common/types/gateway-exception.js';
import { ErrorCode } from '../common/types/error-code.enum.js';
import type { AuthenticatedIdentity } from '../auth/auth.types.js';
import type { NormalizedBatch } from './dto/batch-request.dto.js';
import type { IngestionBatchResponseDto } from './dto/batch-response.dto.js';
import { WalJournalService } from '../storage/wal/wal-journal.service.js';
import { ReceiptService } from '../storage/receipt/receipt.service.js';
import { ArchiveWriterService } from '../storage/archive/archive-writer.service.js';
import { DeduplicationLockService } from '../storage/receipt/receipt-lock.service.js';

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    private readonly projectService: ProjectService,
    private readonly diagnostics: DiagnosticsService,
    @Optional() private readonly walService?: WalJournalService,
    @Optional() private readonly receiptService?: ReceiptService,
    @Optional() private readonly archiveWriter?: ArchiveWriterService,
    @Optional() private readonly lockService?: DeduplicationLockService,
  ) {}

  public async admitAndIngestBatch(
    batch: NormalizedBatch,
    identity: AuthenticatedIdentity,
  ): Promise<IngestionBatchResponseDto> {
    // 1. Whole-batch atomic tenant & project authorization
    for (let i = 0; i < batch.events.length; i++) {
      const event = batch.events[i]!;
      const projectId = event.skyra?.project_id;
      const environment = event.service?.environment;

      if (!projectId || typeof projectId !== 'string') {
        this.diagnostics.recordValidationFailure(batch.batch_id, batch.events.length, `Missing skyra.project_id at event ${i}`);
        throw new GatewayException(
          ErrorCode.SCHEMA_VALIDATION_FAILED,
          `Event at index ${i} is missing required field "skyra.project_id"`,
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }

      if (!environment || typeof environment !== 'string') {
        this.diagnostics.recordValidationFailure(batch.batch_id, batch.events.length, `Missing service.environment at event ${i}`);
        throw new GatewayException(
          ErrorCode.SCHEMA_VALIDATION_FAILED,
          `Event at index ${i} is missing required field "service.environment"`,
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }

      try {
        const { quota } = await this.projectService.authorizeProjectAccess(projectId, environment, identity);

        // Check project-specific quota limits if configured
        if (quota && batch.events.length > quota.maxBatchSize) {
          throw new GatewayException(
            ErrorCode.BATCH_OVERSIZED,
            `Batch size ${batch.events.length} exceeds project quota limit of ${quota.maxBatchSize}`,
            HttpStatus.PAYLOAD_TOO_LARGE,
          );
        }
      } catch (err: unknown) {
        if (err instanceof GatewayException) {
          this.diagnostics.recordAuthzFailure(identity.tenantId, projectId, err.message);
        }
        throw err;
      }
    }

    // 2. Storage Readiness Verification
    if (!this.walService || !this.receiptService || !this.walService.getStatus().isReady) {
      this.diagnostics.recordStorageUnavailable(batch.batch_id, batch.events.length);
      throw new GatewayException(
        ErrorCode.STORAGE_NOT_READY,
        'Centralized ingestion storage journal is not ready or storage backend is uninitialized.',
        HttpStatus.SERVICE_UNAVAILABLE,
        {
          retryable: true,
          details: [
            { path: 'batch_id', message: batch.batch_id },
            { path: 'event_count', message: String(batch.events.length) },
            { path: 'content_digest', message: batch.contentDigestSha256 },
          ],
        },
      );
    }

    const primaryProjectId = batch.events[0]!.skyra!.project_id!;
    const canonicalDigest = batch.contentDigestSha256.startsWith('sha256:')
      ? batch.contentDigestSha256
      : `sha256:${batch.contentDigestSha256}`;

    // Concurrency Lock: serialize in-flight requests for identical batch identity (ADR-015 Scenario 7)
    const releaseLock = this.lockService
      ? await this.lockService.acquire(identity.tenantId, primaryProjectId, batch.batch_id)
      : () => {};

    try {
      // 3. Authoritative Replay & Deduplication Check (ADR-015)
      const idempotency = await this.receiptService.checkIdempotency(
        identity.tenantId,
        primaryProjectId,
        batch.batch_id,
        canonicalDigest,
      );

      if (idempotency.duplicate && idempotency.receipt) {
        this.logger.log(
          `Idempotent batch retry acknowledged: batch_id=${batch.batch_id}, tenant=${identity.tenantId}, project=${primaryProjectId}`,
        );
        return {
          status: 'durably_accepted',
          batch_id: batch.batch_id,
          accepted_count: idempotency.receipt.acceptedCount,
          duplicate: true,
          receipt: {
            receipt_id: idempotency.receipt.receiptId,
            journal_segment: idempotency.receipt.journalSegment,
            journal_offset: idempotency.receipt.journalOffset,
            committed_at: idempotency.receipt.committedAt,
            content_digest: idempotency.receipt.contentDigest,
          },
        };
      }

      // 4. Contiguous Frame Serialization & Synchronous fsync Append
      const payloadBuf = Buffer.from(JSON.stringify(batch.events), 'utf-8');
      let commitResult: { receipt: any; frame: any };

      try {
        commitResult = await this.walService.appendBatch(
          {
            batchId: batch.batch_id,
            tenantId: identity.tenantId,
            projectId: primaryProjectId,
            eventCount: batch.events.length,
            contentDigestSha256: canonicalDigest,
          },
          payloadBuf,
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`WAL append failure for batch ${batch.batch_id}: ${msg}`);
        throw new GatewayException(
          ErrorCode.STORAGE_NOT_READY,
          `Failed to commit batch to physical journal: ${msg}`,
          HttpStatus.SERVICE_UNAVAILABLE,
          { retryable: true },
        );
      }

      const { receipt: walReceipt } = commitResult;

      // 5. Authoritative Receipt Index Registration
      try {
        await this.receiptService.recordReceipt(walReceipt);
      } catch (err: unknown) {
        // WAL commit is authoritative; log warning if DB insert fails in crash window
        this.logger.warn(
          `Failed to persist receipt row for committed batch ${batch.batch_id} in PostgreSQL: ${String(err)}. Frame will be reconciled on recovery.`,
        );
      }

      // 6. Central JSONL Archive Append
      if (this.archiveWriter) {
        try {
          const primaryEvent = batch.events[0]!;
          const rawTs = (primaryEvent['@timestamp'] as string) || new Date().toISOString();
          const dateStr = rawTs.slice(0, 10);
          const environment = (primaryEvent.service?.environment || 'production') as
            | 'production'
            | 'staging'
            | 'development'
            | 'test'
            | 'local';
          const serviceName = primaryEvent.service?.name || 'gateway';

          await this.archiveWriter.appendEvents(
            {
              tenantId: identity.tenantId,
              projectId: primaryProjectId,
              environment,
              serviceName,
              date: dateStr,
              journalSegment: walReceipt.journalSegment,
              journalStartOffset: walReceipt.journalOffset,
              journalEndOffset: walReceipt.journalOffset + payloadBuf.length,
            },
            batch.events as any,
          );
        } catch (err: unknown) {
          this.logger.error(`Archive JSONL append failed for committed batch ${batch.batch_id}: ${String(err)}`);
        }
      }

      // 7. Authoritative durably_accepted Response (ADR-013)
      return {
        status: 'durably_accepted',
        batch_id: batch.batch_id,
        accepted_count: batch.events.length,
        duplicate: false,
        receipt: {
          receipt_id: walReceipt.receiptId,
          journal_segment: walReceipt.journalSegment,
          journal_offset: walReceipt.journalOffset,
          committed_at: walReceipt.committedAt,
          content_digest: walReceipt.contentDigest,
        },
      };
    } finally {
      releaseLock();
    }
  }
}
