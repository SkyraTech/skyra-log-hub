/**
 * @skyra/logger-browser - Console Transport
 * Provides rich development and browser debugging logs without leaking secrets.
 */

import type { SkyraLogEvent, LogLevel } from '@skyra/logger-core/types';
import type { BrowserTransport, BrowserTransportResult } from './transport.interface.js';

export interface ConsoleTransportOptions {
  readonly levels?: readonly LogLevel[];
  readonly useColors?: boolean;
}

const LEVEL_COLORS: Record<LogLevel, string> = {
  trace: 'color: #888888; font-weight: normal;',
  debug: 'color: #00bcd4; font-weight: normal;',
  info: 'color: #2196f3; font-weight: bold;',
  warn: 'color: #ff9800; font-weight: bold;',
  error: 'color: #f44336; font-weight: bold;',
  fatal: 'color: #d32f2f; font-weight: bold; background: #ffebee;',
};

export class ConsoleTransport implements BrowserTransport {
  public readonly name = 'console';
  private readonly _allowedLevels: Set<LogLevel>;
  private readonly _useColors: boolean;

  constructor(options?: ConsoleTransportOptions) {
    const defaultLevels: LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];
    this._allowedLevels = new Set(options?.levels ?? defaultLevels);
    this._useColors = options?.useColors !== false && typeof window !== 'undefined';
  }

  public async send(
    batch: readonly SkyraLogEvent[]
  ): Promise<BrowserTransportResult> {
    if (typeof console === 'undefined') {
      return {
        success: true,
        deliveredCount: batch.length,
        droppedCount: 0,
        retryable: false,
      };
    }

    let delivered = 0;
    for (const ev of batch) {
      const level = ev.log.level;
      if (!this._allowedLevels.has(level)) {
        continue;
      }

      const component = ev.skyra.component ? ` [${ev.skyra.component}]` : '';
      const prefix = `[${ev['@timestamp']}] [${level.toUpperCase()}]${component}:`;
      const args: unknown[] = [];

      if (this._useColors) {
        const style = LEVEL_COLORS[level] ?? 'color: inherit;';
        args.push(`%c${prefix}`, style, ev.message);
      } else {
        args.push(prefix, ev.message);
      }

      if (ev.skyra.business && Object.keys(ev.skyra.business).length > 0) {
        args.push(ev.skyra.business);
      }
      if (ev.error) {
        args.push(ev.error);
      }

      switch (level) {
        case 'trace':
        case 'debug':
          (console.debug || console.log).apply(console, args);
          break;
        case 'info':
          (console.info || console.log).apply(console, args);
          break;
        case 'warn':
          (console.warn || console.log).apply(console, args);
          break;
        case 'error':
        case 'fatal':
          (console.error || console.log).apply(console, args);
          break;
        default:
          console.log.apply(console, args);
          break;
      }
      delivered++;
    }

    return {
      success: true,
      deliveredCount: delivered,
      droppedCount: batch.length - delivered,
      retryable: false,
    };
  }

  public async flush(): Promise<void> {
    // Console output is synchronous
  }

  public async dispose(): Promise<void> {
    // No-op
  }
}
