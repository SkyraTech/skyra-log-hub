import type { LogLevel } from '@skyra/logger-core';

export interface TransportStatus {
  totalEventsWritten: number;
  totalBytesWritten: number;
  totalEventsFsynced: number;
  currentActiveFile?: string;
  isClosed: boolean;
}

export interface SkyraTransport {
  /**
   * Writes a formatted, newline-terminated JSONL line.
   */
  write(level: LogLevel, line: string, bytes: number): Promise<void>;

  /**
   * Synchronous emergency direct write for critical logs when queue is saturated or during unhandled exceptions.
   */
  emergencyWrite(level: LogLevel, line: string, bytes: number): void;

  /**
   * Flushes all in-memory OS buffers to storage.
   */
  flush(): Promise<void>;

  /**
   * Gracefully flushes and closes file handles. Rejects future writes.
   */
  close(): Promise<void>;

  /**
   * Returns current transport health and status statistics.
   */
  getStatus(): TransportStatus;
}
