import type { LogLevel } from '@skyra/logger-core';
import type { ResourceLimits } from '../config.js';
import { emitInternalDiagnostic } from './diagnostics.js';

export interface QueueItem {
  level: LogLevel;
  line: string;
  bytes: number;
}

export type WriteBatchHandler = (items: QueueItem[]) => Promise<void>;
export type EmergencyWriteHandler = (item: QueueItem) => void;

export class WriteQueue {
  private queue: QueueItem[] = [];
  private currentBytes = 0;
  private isProcessing = false;
  private isClosed = false;
  private flushPromises: Array<{ resolve: () => void; reject: (err: Error) => void }> = [];
  private droppedCount = 0;

  constructor(
    private readonly limits: ResourceLimits,
    private readonly writeHandler: WriteBatchHandler,
    private readonly emergencyHandler: EmergencyWriteHandler,
    private readonly onDrop?: (dropped: number, reason: string) => void
  ) {}

  /**
   * Enqueues a formatted log record for background writing.
   * Returns true if accepted, false if dropped due to queue saturation.
   */
  public enqueue(level: LogLevel, line: string): boolean {
    if (this.isClosed) {
      emitInternalDiagnostic('WriteQueue', 'Write attempted after logger has been closed');
      return false;
    }

    const itemBytes = Buffer.byteLength(line, 'utf-8');

    // Check bounded capacity limits
    const wouldExceedCount = this.queue.length + 1 > this.limits.maxPendingEvents;
    const wouldExceedMemory = this.currentBytes + itemBytes > this.limits.maxQueueMemoryBytes;

    if (wouldExceedCount || wouldExceedMemory) {
      // Emergency bypass for critical events: NEVER drop error or fatal
      if (level === 'error' || level === 'fatal') {
        try {
          this.emergencyHandler({ level, line, bytes: itemBytes });
          return true;
        } catch (err) {
          emitInternalDiagnostic('EmergencyWriteFailed', 'Direct emergency write failed for critical log', err);
          return false;
        }
      }

      // For non-critical events (trace, debug, info, warn), drop and record metric
      this.droppedCount++;
      const reason = wouldExceedMemory
        ? `Queue memory limit exceeded (${this.currentBytes} + ${itemBytes} > ${this.limits.maxQueueMemoryBytes} bytes)`
        : `Queue item limit exceeded (${this.queue.length} >= ${this.limits.maxPendingEvents})`;

      if (this.onDrop) {
        try {
          this.onDrop(1, reason);
        } catch {
          // Prevent user callback failure from crashing logger
        }
      }

      emitInternalDiagnostic('QueueOverflow', `Dropped log level='${level}' due to: ${reason}`);
      return false;
    }

    this.queue.push({ level, line, bytes: itemBytes });
    this.currentBytes += itemBytes;

    this.scheduleProcessing();
    return true;
  }

  private scheduleProcessing(): void {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }
    this.isProcessing = true;

    // Use queueMicrotask or setImmediate for non-blocking asynchronous dispatch
    queueMicrotask(() => {
      this.processLoop();
    });
  }

  private async processLoop(): Promise<void> {
    while (this.queue.length > 0) {
      // Drain up to 256 items or ~64 KiB per batch to optimize I/O and reduce context switching
      const batch: QueueItem[] = [];
      let batchBytes = 0;

      while (this.queue.length > 0 && batch.length < 256 && batchBytes < 64 * 1024) {
        const item = this.queue.shift();
        if (!item) break;
        batch.push(item);
        batchBytes += item.bytes;
      }

      this.currentBytes = Math.max(0, this.currentBytes - batchBytes);

      try {
        await this.writeHandler(batch);
      } catch (err) {
        emitInternalDiagnostic('WriteHandlerError', 'Transport write batch failed', err);
        // Do not re-enqueue repeatedly to prevent infinite error loops
      }
    }

    this.isProcessing = false;

    // If flush was requested and queue is now drained
    if (this.queue.length === 0 && this.flushPromises.length > 0) {
      const waiters = [...this.flushPromises];
      this.flushPromises = [];
      for (const w of waiters) {
        w.resolve();
      }
    }
  }

  /**
   * Returns a promise that resolves when all currently queued records have been written.
   */
  public async flush(): Promise<void> {
    if (this.queue.length === 0 && !this.isProcessing) {
      return;
    }

    return new Promise<void>((resolve, reject) => {
      this.flushPromises.push({ resolve, reject });
      this.scheduleProcessing();
    });
  }

  /**
   * Flushes all pending records and marks the queue closed.
   * Future writes will be rejected.
   */
  public async close(): Promise<void> {
    if (this.isClosed) return;
    this.isClosed = true;
    await this.flush();
  }

  public getStats() {
    return {
      pendingCount: this.queue.length,
      pendingBytes: this.currentBytes,
      droppedCount: this.droppedCount,
      isClosed: this.isClosed,
      isProcessing: this.isProcessing,
    };
  }
}
