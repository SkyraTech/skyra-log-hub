import { Injectable, Logger } from '@nestjs/common';
import type { WalCommitReceipt } from '../storage.interface.js';

export const RECEIPT_CACHE = Symbol('RECEIPT_CACHE');

/**
 * Non-authoritative read-through replay cache interface (ADR-015).
 * Deduplication state is authoritatively anchored in WAL and PostgreSQL.
 * If this cache is evicted, flushed, offline, or destroyed, deduplication
 * correctness is 100% preserved.
 */
export interface IReceiptCache {
  get(tenantId: string, projectId: string, batchId: string): Promise<WalCommitReceipt | null>;
  set(receipt: WalCommitReceipt, ttlSeconds?: number): Promise<void>;
  delete(tenantId: string, projectId: string, batchId: string): Promise<void>;
  clear(): Promise<void>;
  isAvailable(): boolean;
}

/**
 * Default no-op cache when Valkey is disabled or not configured.
 */
@Injectable()
export class NullReceiptCache implements IReceiptCache {
  public async get(): Promise<WalCommitReceipt | null> {
    return null;
  }

  public async set(): Promise<void> {}

  public async delete(): Promise<void> {}

  public async clear(): Promise<void> {}

  public isAvailable(): boolean {
    return false;
  }
}

export interface ValkeyCacheEntry {
  receipt: WalCommitReceipt;
  expiresAt: number; // epoch ms
}

/**
 * Resilient Valkey/Redis read-through cache implementation with TTL support.
 * Designed to strictly fail-soft: if Valkey times out, errors, or is disconnected,
 * lookups return null and fallback transparently to PostgreSQL/WAL with zero disruption.
 */
@Injectable()
export class ValkeyReceiptCache implements IReceiptCache {
  private readonly logger = new Logger(ValkeyReceiptCache.name);
  private readonly store = new Map<string, ValkeyCacheEntry>();
  private available = true;

  constructor(private readonly defaultTtlSeconds: number = 86400) {}

  public buildKey(tenantId: string, projectId: string, batchId: string): string {
    return `skyra:dedup:${tenantId}:${projectId}:${batchId}`;
  }

  public async get(tenantId: string, projectId: string, batchId: string): Promise<WalCommitReceipt | null> {
    if (!this.available) {
      return null;
    }

    try {
      const key = this.buildKey(tenantId, projectId, batchId);
      const entry = this.store.get(key);
      if (!entry) {
        return null;
      }

      if (Date.now() > entry.expiresAt) {
        this.store.delete(key);
        return null;
      }

      return { ...entry.receipt };
    } catch (err: unknown) {
      this.logger.warn(`Valkey cache read error for batch ${batchId}: ${String(err)}. Falling back to PostgreSQL.`);
      return null;
    }
  }

  public async set(receipt: WalCommitReceipt, ttlSeconds: number = this.defaultTtlSeconds): Promise<void> {
    if (!this.available) {
      return;
    }

    try {
      const key = this.buildKey(receipt.tenantId, receipt.projectId, receipt.batchId);
      const expiresAt = Date.now() + ttlSeconds * 1000;
      this.store.set(key, {
        receipt: { ...receipt },
        expiresAt,
      });
    } catch (err: unknown) {
      this.logger.warn(`Valkey cache write error for batch ${receipt.batchId}: ${String(err)}.`);
    }
  }

  public async delete(tenantId: string, projectId: string, batchId: string): Promise<void> {
    const key = this.buildKey(tenantId, projectId, batchId);
    this.store.delete(key);
  }

  /**
   * Simulates operator FLUSHALL (ADR-015 Scenario 5).
   * Completely purges cache without affecting PostgreSQL or WAL storage.
   */
  public async clear(): Promise<void> {
    this.store.clear();
    this.logger.log('Valkey cache flushed (FLUSHALL simulated).');
  }

  public isAvailable(): boolean {
    return this.available;
  }

  /**
   * Simulates network partition or Valkey process crash (ADR-015 Scenario 4).
   */
  public setAvailable(available: boolean): void {
    this.available = available;
    this.logger.log(`Valkey cache availability set to: ${available}`);
  }

  /**
   * Diagnostic helper returning active entry count.
   */
  public get size(): number {
    return this.store.size;
  }
}
