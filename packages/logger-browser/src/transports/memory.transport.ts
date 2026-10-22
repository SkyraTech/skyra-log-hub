/**
 * @skyra/logger-browser - Memory Transport
 * Retains events in an in-memory bounded ring buffer. Ideal for tests and offline diagnostics.
 */

import type { SkyraLogEvent } from '@skyra/logger-core/types';
import type { BrowserTransport, BrowserTransportResult } from './transport.interface.js';

export class MemoryTransport implements BrowserTransport {
  public readonly name = 'memory';
  private readonly _events: SkyraLogEvent[] = [];
  private readonly _maxEvents: number;

  constructor(options?: { maxEvents?: number }) {
    this._maxEvents = Math.max(1, options?.maxEvents ?? 1000);
  }

  public async send(
    batch: readonly SkyraLogEvent[]
  ): Promise<BrowserTransportResult> {
    for (const ev of batch) {
      if (this._events.length >= this._maxEvents) {
        this._events.shift(); // Drop oldest FIFO
      }
      this._events.push(ev);
    }

    return {
      success: true,
      deliveredCount: batch.length,
      droppedCount: 0,
      retryable: false,
    };
  }

  public getEvents(): readonly SkyraLogEvent[] {
    return [...this._events];
  }

  public getEventCount(): number {
    return this._events.length;
  }

  public clear(): void {
    this._events.length = 0;
  }

  public async flush(): Promise<void> {
    // In-memory writes are immediate
  }

  public async dispose(): Promise<void> {
    this.clear();
  }
}
