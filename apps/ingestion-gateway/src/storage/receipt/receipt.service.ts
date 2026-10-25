import { Injectable, Inject, Optional, HttpStatus, Logger } from '@nestjs/common';
import {
  RECEIPT_REPOSITORY,
  type IReceiptRepository,
  type DeduplicationReceiptRecord,
} from '../../metadata/repositories/receipt.repository.interface.js';
import type { WalCommitReceipt, WalFrame } from '../storage.interface.js';
import { WalJournalService } from '../wal/wal-journal.service.js';
import { GatewayException } from '../../common/types/gateway-exception.js';
import { ErrorCode } from '../../common/types/error-code.enum.js';
import { RECEIPT_CACHE, type IReceiptCache } from './receipt-cache.interface.js';
import { DeduplicationLockService } from './receipt-lock.service.js';

export const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export interface IdempotencyCheckResult {
  duplicate: boolean;
  receipt?: WalCommitReceipt;
}

@Injectable()
export class ReceiptService {
  private readonly logger = new Logger(ReceiptService.name);

  constructor(
    @Inject(RECEIPT_REPOSITORY)
    private readonly receiptRepo: IReceiptRepository,
    @Optional() private readonly walService?: WalJournalService,
    @Optional()
    @Inject(RECEIPT_CACHE)
    private readonly cache?: IReceiptCache,
    @Optional() private readonly lockService?: DeduplicationLockService,
  ) {}

  /**
   * Checks the authoritative deduplication index before committing a batch (ADR-015).
   * 1. Consults optional read-through Valkey cache for ultra-low latency response.
   * 2. On cache miss or unavailable cache, queries persistent PostgreSQL deduplication_receipts.
   * 3. If missing from PostgreSQL (e.g. crash in commit window), queries in-memory WAL journal (Scenario A).
   * Returns duplicate receipt if identical, throws 409 conflict if content digest differs.
   */
  public async checkIdempotency(
    tenantId: string,
    projectId: string,
    batchId: string,
    incomingContentDigest: string,
    clock: Date = new Date(),
  ): Promise<IdempotencyCheckResult> {
    // 1. Non-authoritative fast-path: Optional read-through cache (ADR-015)
    if (this.cache && this.cache.isAvailable()) {
      try {
        const cached = await this.cache.get(tenantId, projectId, batchId);
        if (cached) {
          const committedAt = new Date(cached.committedAt);
          if (committedAt.getTime() + SEVEN_DAYS_MS <= clock.getTime()) {
            this.logger.log(`Cached receipt expired for batch "${batchId}" (committed at ${cached.committedAt}, now ${clock.toISOString()})`);
            void this.cache.delete(tenantId, projectId, batchId);
            return { duplicate: false };
          }

          if (cached.contentDigest !== incomingContentDigest) {
            this.logger.warn(
              `Idempotency conflict (Cache hit): batch_id "${batchId}" for tenant "${tenantId}" and project "${projectId}" previously committed with digest "${cached.contentDigest}", received "${incomingContentDigest}"`,
            );
            throw new GatewayException(
              ErrorCode.IDEMPOTENCY_CONFLICT,
              `Batch ID "${batchId}" was already committed with different payload contents`,
              HttpStatus.CONFLICT,
              {
                retryable: false,
                details: [
                  { path: 'batch_id', message: batchId },
                  { path: 'stored_digest', message: cached.contentDigest },
                  { path: 'incoming_digest', message: incomingContentDigest },
                ],
              },
            );
          }
          return {
            duplicate: true,
            receipt: cached,
          };
        }
      } catch (err: unknown) {
        if (err instanceof GatewayException) throw err;
        this.logger.warn(`Receipt cache read failure for batch ${batchId}: ${String(err)}. Falling back to persistent index.`);
      }
    }

    // 2. Authoritative PostgreSQL Deduplication Index Lookup
    const existing = await this.receiptRepo.findReceipt(tenantId, projectId, batchId);

    // If receipt has expired outside the 7-day deduplication horizon, it is no longer an active duplicate
    if (existing && existing.expiresAt <= clock) {
      this.logger.log(
        `Deduplication receipt expired for batch_id "${batchId}" (expired at ${existing.expiresAt.toISOString()}, now ${clock.toISOString()})`,
      );
      return { duplicate: false };
    }

    if (!existing) {
      // 3. Fallback to authoritative WAL committed frames in case PostgreSQL write failed earlier (Scenario A / 11)
      const walFrame = this.walService?.findCommittedFrame(tenantId, projectId, batchId);
      if (walFrame) {
        if (walFrame.contentDigestSha256 !== incomingContentDigest) {
          this.logger.warn(
            `Idempotency conflict (WAL recovered): batch_id "${batchId}" for tenant "${tenantId}" and project "${projectId}" previously committed with digest "${walFrame.contentDigestSha256}", received "${incomingContentDigest}"`,
          );
          throw new GatewayException(
            ErrorCode.IDEMPOTENCY_CONFLICT,
            `Batch ID "${batchId}" was already committed with different payload contents`,
            HttpStatus.CONFLICT,
            {
              retryable: false,
              details: [
                { path: 'batch_id', message: batchId },
                { path: 'stored_digest', message: walFrame.contentDigestSha256 },
                { path: 'incoming_digest', message: incomingContentDigest },
              ],
            },
          );
        }

        const reconstructedReceipt: WalCommitReceipt = {
          receiptId: crypto.randomUUID(),
          journalSegment: 'active.wal',
          journalOffset: walFrame.offset,
          committedAt: new Date().toISOString(),
          contentDigest: walFrame.contentDigestSha256,
          batchId: walFrame.batchId,
          tenantId: walFrame.tenantId,
          projectId: walFrame.projectId,
          acceptedCount: walFrame.eventCount,
          duplicate: true,
        };

        // Asynchronously persist missing receipt record back to PostgreSQL and populate cache
        void this.recordReceipt(reconstructedReceipt).catch(() => {});

        return {
          duplicate: true,
          receipt: reconstructedReceipt,
        };
      }

      return { duplicate: false };
    }

    // Digest comparison (Anti-collusion / anti-bug rule per ADR-015 Scenario 8)
    if (existing.contentDigest !== incomingContentDigest) {
      this.logger.warn(
        `Idempotency conflict: batch_id "${batchId}" for tenant "${tenantId}" and project "${projectId}" previously committed with digest "${existing.contentDigest}", received "${incomingContentDigest}"`,
      );
      throw new GatewayException(
        ErrorCode.IDEMPOTENCY_CONFLICT,
        `Batch ID "${batchId}" was already committed with different payload contents`,
        HttpStatus.CONFLICT,
        {
          retryable: false,
          details: [
            { path: 'batch_id', message: batchId },
            { path: 'stored_digest', message: existing.contentDigest },
            { path: 'incoming_digest', message: incomingContentDigest },
          ],
        },
      );
    }

    const receipt: WalCommitReceipt = {
      receiptId: existing.id,
      journalSegment: existing.journalSegment,
      journalOffset: Number(existing.journalOffset),
      committedAt: existing.committedAt.toISOString(),
      contentDigest: existing.contentDigest,
      batchId: existing.batchId,
      tenantId: existing.tenantId,
      projectId: existing.projectId,
      acceptedCount: existing.acceptedCount,
      duplicate: true,
    };

    // Lazily re-populate cache on cache-miss recovery (ADR-015 Scenario 5)
    if (this.cache && this.cache.isAvailable()) {
      void this.cache.set(receipt, 86400).catch(() => {});
    }

    return {
      duplicate: true,
      receipt,
    };
  }

  /**
   * Records a committed batch in the persistent deduplication index with a 7-day expiration horizon,
   * and populates the optional read-through cache with a 24-hour TTL.
   */
  public async recordReceipt(walReceipt: WalCommitReceipt): Promise<void> {
    const committedAt = new Date(walReceipt.committedAt);
    const expiresAt = new Date(committedAt.getTime() + SEVEN_DAYS_MS);

    const record: DeduplicationReceiptRecord = {
      id: walReceipt.receiptId,
      tenantId: walReceipt.tenantId,
      projectId: walReceipt.projectId,
      batchId: walReceipt.batchId,
      contentDigest: walReceipt.contentDigest,
      journalSegment: walReceipt.journalSegment,
      journalOffset: BigInt(walReceipt.journalOffset),
      acceptedCount: walReceipt.acceptedCount,
      committedAt,
      expiresAt,
    };

    await this.receiptRepo.saveReceipt(record);

    // Populate optional cache
    if (this.cache && this.cache.isAvailable()) {
      try {
        await this.cache.set(walReceipt, 86400);
      } catch (err) {
        this.logger.warn(`Failed to populate replay cache for batch ${walReceipt.batchId}: ${String(err)}`);
      }
    }
  }

  /**
   * Restores missing receipt index records from committed WAL frames during startup recovery.
   */
  public async reconcileRecoveredFrames(frames: WalFrame[]): Promise<number> {
    if (frames.length === 0) return 0;

    const records: DeduplicationReceiptRecord[] = frames.map((f) => {
      const now = new Date();
      return {
        id: crypto.randomUUID(),
        tenantId: f.tenantId,
        projectId: f.projectId,
        batchId: f.batchId,
        contentDigest: f.contentDigestSha256,
        journalSegment: 'active.wal',
        journalOffset: BigInt(f.offset),
        acceptedCount: f.eventCount,
        committedAt: now,
        expiresAt: new Date(now.getTime() + SEVEN_DAYS_MS),
      };
    });

    const reconciled = await this.receiptRepo.reconcileReceipts(records);
    if (reconciled > 0) {
      this.logger.log(`Startup reconciliation: restored ${reconciled} missing deduplication receipts from WAL.`);
    }
    return reconciled;
  }

  public getCache(): IReceiptCache | undefined {
    return this.cache;
  }

  public getLockService(): DeduplicationLockService | undefined {
    return this.lockService;
  }
}
