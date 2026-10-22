import type { LogLevel } from '@skyra/logger-core';
import type { SkyraTransport, TransportStatus } from './transport.interface.js';

export class StdoutTransport implements SkyraTransport {
  private totalEventsWritten = 0;
  private totalBytesWritten = 0;
  private isClosed = false;

  public async write(_level: LogLevel, line: string, bytes: number): Promise<void> {
    if (this.isClosed) return;

    this.totalEventsWritten++;
    this.totalBytesWritten += bytes;

    const canContinue = process.stdout.write(line);
    if (!canContinue) {
      await new Promise<void>((resolve) => {
        process.stdout.once('drain', resolve);
      });
    }
  }

  public emergencyWrite(_level: LogLevel, line: string, bytes: number): void {
    if (this.isClosed) return;
    this.totalEventsWritten++;
    this.totalBytesWritten += bytes;
    try {
      process.stdout.write(line);
    } catch {
      // Ignored in emergency
    }
  }

  public async flush(): Promise<void> {
    return new Promise<void>((resolve) => {
      // If stdout buffer is drained, resolve immediately
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stream = process.stdout as any;
      if (!stream._writableState || stream._writableState.needDrain !== true) {
        resolve();
      } else {
        process.stdout.once('drain', resolve);
      }
    });
  }

  public async close(): Promise<void> {
    this.isClosed = true;
    await this.flush();
  }

  public getStatus(): TransportStatus {
    return {
      totalEventsWritten: this.totalEventsWritten,
      totalBytesWritten: this.totalBytesWritten,
      isClosed: this.isClosed,
    };
  }
}
