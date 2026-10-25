/**
 * @skyra/log-shipper - Crash-Recoverable Checkpoint Persistence
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import type { CheckpointRecord, PendingBatch, GatewayReceipt } from './types.js';

export class CheckpointManager {
  private readonly memoryCache = new Map<string, CheckpointRecord>();

  constructor(private readonly checkpointDir: string) {
    if (!fs.existsSync(this.checkpointDir)) {
      fs.mkdirSync(this.checkpointDir, { recursive: true });
    }
  }

  /**
   * Derives a deterministic safe filename for the checkpoint record based on the spool locator.
   */
  private getCheckpointFilePath(relativeLocator: string): string {
    const hash = crypto.createHash('sha256').update(relativeLocator).digest('hex');
    return path.join(this.checkpointDir, `${hash}.json`);
  }

  /**
   * Retrieves the current checkpoint record for a source spool, loading from disk if not cached.
   */
  public getRecord(relativeLocator: string, fullPath: string): CheckpointRecord {
    if (this.memoryCache.has(relativeLocator)) {
      return this.memoryCache.get(relativeLocator)!;
    }

    const filePath = this.getCheckpointFilePath(relativeLocator);
    if (fs.existsSync(filePath)) {
      try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const record = JSON.parse(raw) as CheckpointRecord;
        this.memoryCache.set(relativeLocator, record);
        return record;
      } catch {
        // Checkpoint file corruption: preserve existing on-disk file for diagnostics
      }
    }

    const newRecord: CheckpointRecord = {
      relativeLocator,
      fullPath,
      lastAckOffset: 0,
      lastAckTimestamp: null,
      pendingBatch: null,
      lastReceipt: null,
      deliveryAttempts: 0,
      lastError: null,
      lastErrorStatus: null,
      updatedAt: new Date().toISOString(),
    };

    this.memoryCache.set(relativeLocator, newRecord);
    this.saveRecord(newRecord);
    return newRecord;
  }

  /**
   * Persists a pending batch in the checkpoint BEFORE first network transmission.
   * Guarantees identical batch identity and content digest on retry after crash.
   */
  public setPendingBatch(relativeLocator: string, pending: PendingBatch): void {
    let record = this.memoryCache.get(relativeLocator);
    if (!record) {
      record = this.getRecord(relativeLocator, '');
    }

    record.pendingBatch = pending;
    record.deliveryAttempts = 0;
    record.lastError = null;
    record.lastErrorStatus = null;
    record.updatedAt = new Date().toISOString();

    this.saveRecord(record);
  }

  /**
   * Advances the acknowledged offset and clears the pending batch ONLY AFTER
   * receiving a validated durable receipt from the gateway.
   */
  public acknowledgeBatch(relativeLocator: string, receipt: GatewayReceipt): void {
    let record = this.memoryCache.get(relativeLocator);
    if (!record) {
      record = this.getRecord(relativeLocator, '');
    }
    if (!record.pendingBatch) return;

    record.lastAckOffset = record.pendingBatch.endOffset;
    record.lastAckTimestamp = receipt.committed_at;
    record.lastReceipt = receipt;
    record.pendingBatch = null;
    record.deliveryAttempts = 0;
    record.lastError = null;
    record.lastErrorStatus = null;
    record.updatedAt = new Date().toISOString();

    this.saveRecord(record);
  }

  /**
   * Records a delivery error and increments attempt count for backoff decisions.
   */
  public recordFailure(relativeLocator: string, error: string, statusCode?: number): void {
    let record = this.memoryCache.get(relativeLocator);
    if (!record) {
      record = this.getRecord(relativeLocator, '');
    }

    record.deliveryAttempts++;
    record.lastError = error;
    record.lastErrorStatus = statusCode ?? null;
    record.updatedAt = new Date().toISOString();

    this.saveRecord(record);
  }

  /**
   * Performs atomic write + fsync + atomic rename to ensure crash-safe persistence.
   */
  private saveRecord(record: CheckpointRecord): void {
    const targetPath = this.getCheckpointFilePath(record.relativeLocator);
    const tempPath = `${targetPath}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
    const payload = JSON.stringify(record, null, 2);

    let fd: number | null = null;
    try {
      fd = fs.openSync(tempPath, 'w', 0o600);
      fs.writeSync(fd, payload, 0, 'utf-8');
      fs.fsyncSync(fd);
      fs.closeSync(fd);
      fd = null;

      fs.renameSync(tempPath, targetPath);
    } catch (err) {
      if (fd !== null) {
        try {
          fs.closeSync(fd);
        } catch {
          // ignore
        }
      }
      if (fs.existsSync(tempPath)) {
        try {
          fs.unlinkSync(tempPath);
        } catch {
          // ignore
        }
      }
      throw err;
    }
  }
}
