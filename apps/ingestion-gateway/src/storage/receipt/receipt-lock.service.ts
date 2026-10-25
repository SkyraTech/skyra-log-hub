import { Injectable, Logger } from '@nestjs/common';

export interface LockReleaseFn {
  (): void;
}

/**
 * High-concurrency deduplication lock service (ADR-015 Scenario 7).
 * Serializes concurrent ingestion attempts for the exact same batch identity
 * (tenantId#projectId#batchId) within gateway worker instances to prevent
 * simultaneous double-commits to the WAL.
 */
@Injectable()
export class DeduplicationLockService {
  private readonly logger = new Logger(DeduplicationLockService.name);
  private readonly inFlightLocks = new Map<string, Promise<void>>();

  /**
   * Builds the canonical mutex key for a batch identity.
   */
  public buildLockKey(tenantId: string, projectId: string, batchId: string): string {
    return `${tenantId}#${projectId}#${batchId}`;
  }

  /**
   * Acquires a serialized lock for the specified batch.
   * If another request is currently committing the exact same batch, this method waits
   * until the active request finishes before returning a release callback.
   */
  public async acquire(tenantId: string, projectId: string, batchId: string): Promise<LockReleaseFn> {
    const key = this.buildLockKey(tenantId, projectId, batchId);

    while (this.inFlightLocks.has(key)) {
      const existingPromise = this.inFlightLocks.get(key);
      if (existingPromise) {
        await existingPromise;
      }
    }

    let releaseResolve!: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      releaseResolve = resolve;
    });

    this.inFlightLocks.set(key, lockPromise);

    let released = false;
    return () => {
      if (!released) {
        released = true;
        this.inFlightLocks.delete(key);
        releaseResolve();
      }
    };
  }

  /**
   * Returns current count of in-flight active locks (for monitoring and diagnostics).
   */
  public get activeLockCount(): number {
    return this.inFlightLocks.size;
  }
}
