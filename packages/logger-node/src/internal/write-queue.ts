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
  private acceptedCount = 0;
  private droppedCount = 0;

  constructor(
    private readonly limits: ResourceLimits,
    private readonly writeHandler: WriteBatchHandler,
    private readonly emergencyHandler?: EmergencyWriteHandler,
    private readonly onDrop?: (dropped: number, reason: string) => void
  ) {}

  /**
   * Enqueues a formatted log record for background writing.
   * Preserves single-writer serialization: all events (normal and critical)
   * pass through the serialized write pipeline.
   *
   * When queue is full:
   * - Critical events (error, fatal) evict non-critical events (trace, debug, info, warn)
   * - Non-critical events are dropped with observable metrics
   * - If queue is completely saturated with critical events, memory bounds are preserved and drop is recorded
   */
  public enqueue(level: LogLevel, line: string): boolean {
    if (this.isClosed) {
      emitInternalDiagnostic('WriteQueue', 'Write attempted after logger has been closed');
      this.droppedCount++;
      return false;
    }

    const itemBytes = Buffer.byteLength(line, 'utf-8');
    const isCritical = level === 'error' || level === 'fatal';

    // Check bounded capacity limits
    let wouldExceedCount = this.queue.length + 1 > this.limits.maxPendingEvents;
    let wouldExceedMemory = this.currentBytes + itemBytes > this.limits.maxQueueMemoryBytes;

    if (wouldExceedCount || wouldExceedMemory) {
      if (isCritical) {
        // Priority Eviction: Evict oldest non-critical events to accommodate critical event
        let evictedBytes = 0;
        let evictedCount = 0;
        for (let i = 0; i < this.queue.length; i++) {
          const item = this.queue[i];
          if (item && item.level !== 'error' && item.level !== 'fatal') {
            this.queue.splice(i, 1);
            this.currentBytes -= item.bytes;
            evictedBytes += item.bytes;
            evictedCount++;
            i--;

            wouldExceedCount = this.queue.length + 1 > this.limits.maxPendingEvents;
            wouldExceedMemory = this.currentBytes + itemBytes > this.limits.maxQueueMemoryBytes;
            if (!wouldExceedCount && !wouldExceedMemory) {
              break;
            }
          }
        }

        if (evictedCount > 0) {
          this.droppedCount += evictedCount;
          emitInternalDiagnostic(
            'QueueEviction',
            `Evicted ${evictedCount} non-critical events (${evictedBytes} bytes) to accommodate critical event level='${level}'`
          );
          if (this.onDrop) {
            try {
              this.onDrop(evictedCount, `Evicted by critical event level='${level}'`);
            } catch {
              // Prevent callback error
            }
          }
        }

        // Re-evaluate capacity after eviction
        if (wouldExceedCount || wouldExceedMemory) {
          // Even after evicting all non-critical events, queue is 100% full of critical events
          this.droppedCount++;
          const reason = wouldExceedMemory
            ? `Critical queue memory saturated (${this.currentBytes} + ${itemBytes} > ${this.limits.maxQueueMemoryBytes} bytes)`
            : `Critical queue item limit saturated (${this.queue.length} >= ${this.limits.maxPendingEvents})`;

          emitInternalDiagnostic('CriticalQueueSaturation', `Dropped critical log level='${level}' due to: ${reason}`);
          if (this.onDrop) {
            try {
              this.onDrop(1, reason);
            } catch {}
          }
          return false;
        }
      } else {
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
    }

    this.queue.push({ level, line, bytes: itemBytes });
    this.currentBytes += itemBytes;
    this.acceptedCount++;

    this.scheduleProcessing();
    return true;
  }

  /**
   * Explicitly records an external drop (e.g. oversized event).
   */
  public recordDrop(count = 1, reason: string): void {
    this.droppedCount += count;
    if (this.onDrop) {
      try {
        this.onDrop(count, reason);
      } catch {}
    }
  }

  private scheduleProcessing(): void {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }
    this.isProcessing = true;

    // Use queueMicrotask for non-blocking asynchronous dispatch
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
      acceptedCount: this.acceptedCount,
      pendingCount: this.queue.length,
      pendingBytes: this.currentBytes,
      droppedCount: this.droppedCount,
      isClosed: this.isClosed,
      isProcessing: this.isProcessing,
    };
  }
}
