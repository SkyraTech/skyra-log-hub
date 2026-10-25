import { Injectable, Inject, Logger, type OnModuleInit, type OnModuleDestroy } from '@nestjs/common';
import {
  RECEIPT_REPOSITORY,
  type IReceiptRepository,
} from '../../metadata/repositories/receipt.repository.interface.js';
import { SEVEN_DAYS_MS } from './receipt.service.js';

export interface RetentionServiceOptions {
  enabled?: boolean;
  intervalMs?: number;
  retentionHorizonMs?: number;
}

/**
 * Background Receipt Retention & Pruning Service (ADR-015 Bounded Horizon).
 * Ensures PostgreSQL deduplication_receipts table remains bounded by automatically
 * purging receipt records that have exceeded the authoritative 7-day deduplication horizon.
 */
@Injectable()
export class ReceiptRetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReceiptRetentionService.name);
  private timer: NodeJS.Timeout | null = null;
  private readonly enabled: boolean;
  private readonly intervalMs: number;
  private readonly retentionHorizonMs: number;

  constructor(
    @Inject(RECEIPT_REPOSITORY)
    private readonly receiptRepo: IReceiptRepository,
    options?: RetentionServiceOptions,
  ) {
    this.enabled = options?.enabled ?? false; // Default disabled until explicitly configured or enabled in production
    this.intervalMs = options?.intervalMs ?? 3600000; // 1 hour
    this.retentionHorizonMs = options?.retentionHorizonMs ?? SEVEN_DAYS_MS; // 7 days
  }

  public onModuleInit(): void {
    if (this.enabled) {
      this.start();
    }
  }

  public onModuleDestroy(): void {
    this.stop();
  }

  /**
   * Starts the background recurring pruning timer.
   */
  public start(): void {
    if (this.timer) return;
    this.logger.log(`Starting receipt retention background pruner (interval: ${this.intervalMs}ms, horizon: ${this.retentionHorizonMs}ms)`);
    this.timer = setInterval(() => {
      void this.pruneExpiredReceipts().catch((err: unknown) => {
        this.logger.error(`Error in scheduled receipt pruning: ${String(err)}`);
      });
    }, this.intervalMs);
    // Don't keep the event loop alive if unref is available
    if (this.timer.unref) {
      this.timer.unref();
    }
  }

  /**
   * Stops the background recurring pruning timer.
   */
  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.logger.log('Stopped receipt retention background pruner');
    }
  }

  /**
   * Prunes all receipts whose expiresAt is earlier than the given date (defaults to now).
   * Returns the count of pruned receipt records.
   */
  public async pruneExpiredReceipts(referenceTime: Date = new Date()): Promise<number> {
    try {
      const count = await this.receiptRepo.pruneExpiredReceipts(referenceTime);
      if (count > 0) {
        this.logger.log(`Pruned ${count} expired deduplication receipt records older than ${referenceTime.toISOString()}`);
      }
      return count;
    } catch (err: unknown) {
      this.logger.error(`Failed to prune expired receipts: ${String(err)}`);
      throw err;
    }
  }

  /**
   * Calculates the exact expiration date for a batch committed at the given timestamp.
   */
  public calculateExpiresAt(committedAt: Date = new Date()): Date {
    return new Date(committedAt.getTime() + this.retentionHorizonMs);
  }
}
