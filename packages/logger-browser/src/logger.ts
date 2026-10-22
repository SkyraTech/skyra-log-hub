/**
 * @skyra/logger-browser - Main SkyraBrowserLogger Implementation
 */

import type { LogLevel, SkyraLogEvent } from '@skyra/logger-core/types';
import type {
  SkyraBrowserLoggerConfig,
  BrowserLoggerStatus,
  TimerOptions,
  TimerHandle,
  NavigationEventPayload,
} from './types.js';
import { resolveBrowserConfig, type ResolvedBrowserConfig } from './config.js';
import { BrowserContext } from './context.js';
import { buildBrowserLogEvent } from './event-builder.js';
import { BatchQueue } from './internal/batch-queue.js';
import { MemoryTransport } from './transports/memory.transport.js';
import { ConsoleTransport } from './transports/console.transport.js';
import { HttpTransport } from './transports/http.transport.js';
import type { BrowserTransport } from './transports/transport.interface.js';
import { installGlobalErrorCapture } from './capture/global-errors.js';
import { installUnhandledRejectionCapture } from './capture/unhandled-rejections.js';
import { trackBrowserNavigation } from './capture/navigation.js';
import { startBrowserTimer } from './instrumentation/timer.js';
import { installLifecycleHandlers } from './internal/lifecycle.js';

const LEVEL_SEVERITY: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

export class SkyraBrowserLogger {
  private readonly _config: ResolvedBrowserConfig;
  private readonly _transport: BrowserTransport;
  private readonly _queue: BatchQueue;
  private readonly _context: BrowserContext;
  private _currentLevel: LogLevel;
  private _isDisposed = false;
  private readonly _cleanups: Array<() => void> = [];

  constructor(
    config: SkyraBrowserLoggerConfig,
    injectedTransport?: BrowserTransport,
    injectedQueue?: BatchQueue,
    injectedContext?: BrowserContext
  ) {
    this._config = resolveBrowserConfig(config);
    this._currentLevel = this._config.level;
    this._context = injectedContext ?? new BrowserContext();

    if (injectedTransport) {
      this._transport = injectedTransport;
    } else if (typeof this._config.transport === 'object' && 'send' in this._config.transport) {
      this._transport = this._config.transport as BrowserTransport;
    } else {
      const conf = this._config.transport;
      if (conf.type === 'memory') {
        this._transport = new MemoryTransport(conf);
      } else if (conf.type === 'http') {
        this._transport = new HttpTransport(conf);
      } else {
        this._transport = new ConsoleTransport(conf);
      }
    }

    this._queue = injectedQueue ?? new BatchQueue(this._config, this._transport);

    // Install global capture & lifecycle only if this is the root logger
    if (!injectedQueue) {
      if (this._config.capture.globalErrors) {
        this._cleanups.push(installGlobalErrorCapture(this));
      }
      if (this._config.capture.unhandledRejections) {
        this._cleanups.push(installUnhandledRejectionCapture(this));
      }
      this._cleanups.push(installLifecycleHandlers(this._queue));
    }
  }

  public isLevelEnabled(level: LogLevel): boolean {
    if (this._config.disabled || this._isDisposed) {
      return false;
    }
    const currentSev = LEVEL_SEVERITY[this._currentLevel] ?? 30;
    const targetSev = LEVEL_SEVERITY[level] ?? 30;
    return targetSev >= currentSev;
  }

  public setLevel(level: LogLevel): void {
    if (LEVEL_SEVERITY[level] !== undefined) {
      this._currentLevel = level;
    }
  }

  public getLevel(): LogLevel {
    return this._currentLevel;
  }

  public getContext(): BrowserContext {
    return this._context;
  }

  public log(level: LogLevel, message: unknown, metadata?: Record<string, unknown>): boolean {
    if (!this.isLevelEnabled(level)) {
      return false;
    }

    // Extract canonical fields from metadata if present
    const action = typeof metadata?.['action'] === 'string' ? metadata['action'] : undefined;
    const outcome = typeof metadata?.['outcome'] === 'string' ? (metadata['outcome'] as import('@skyra/logger-core/types').EventOutcome) : undefined;
    const durationNs = typeof metadata?.['durationNs'] === 'number' ? metadata['durationNs'] : undefined;
    const durationMs = typeof metadata?.['durationMs'] === 'number' ? metadata['durationMs'] : undefined;
    const route = typeof metadata?.['route'] === 'string' ? metadata['route'] : undefined;
    const component = typeof metadata?.['component'] === 'string' ? metadata['component'] : this._config.component;
    const http = typeof metadata?.['http'] === 'object' && metadata['http'] !== null
      ? (metadata['http'] as Record<string, unknown>)
      : undefined;
    const error = metadata?.['error'];

    // Strip extracted fields from remaining business metadata
    let cleanMetadata: Record<string, unknown> | undefined;
    if (metadata) {
      const rest = { ...metadata };
      delete rest['action'];
      delete rest['outcome'];
      delete rest['durationNs'];
      delete rest['durationMs'];
      delete rest['route'];
      delete rest['component'];
      delete rest['http'];
      delete rest['error'];
      if (Object.keys(rest).length > 0) {
        cleanMetadata = rest;
      }
    }

    const event = buildBrowserLogEvent(this._config, {
      level,
      message,
      metadata: cleanMetadata,
      context: this._context.get(),
      component,
      action,
      outcome,
      durationNs,
      durationMs,
      route,
      http,
      error,
    });

    return this._queue.enqueue(event);
  }

  public trace(message: unknown, metadata?: Record<string, unknown>): boolean {
    return this.log('trace', message, metadata);
  }

  public debug(message: unknown, metadata?: Record<string, unknown>): boolean {
    return this.log('debug', message, metadata);
  }

  public info(message: unknown, metadata?: Record<string, unknown>): boolean {
    return this.log('info', message, metadata);
  }

  public warn(message: unknown, metadata?: Record<string, unknown>): boolean {
    return this.log('warn', message, metadata);
  }

  public error(message: unknown, metadata?: Record<string, unknown>): boolean {
    return this.log('error', message, metadata);
  }

  public fatal(message: unknown, metadata?: Record<string, unknown>): boolean {
    return this.log('fatal', message, metadata);
  }

  public child(childContext: {
    component?: string;
    labels?: Record<string, string>;
    tags?: readonly string[];
    custom?: Record<string, unknown>;
  }): SkyraBrowserLogger {
    const newContext = new BrowserContext();
    newContext.set({
      ...this._context.get(),
      ...childContext,
    });

    const childConfig: SkyraBrowserLoggerConfig = {
      projectId: this._config.projectId,
      serviceName: this._config.serviceName,
      environment: this._config.environment,
      level: this._currentLevel,
      component: childContext.component ?? this._config.component,
      serviceVersion: this._config.serviceVersion,
      includeUserAgent: this._config.includeUserAgent,
      transport: this._transport,
      limits: this._config.limits,
      redaction: this._config.redaction,
      validateEvents: this._config.validateEvents,
      disabled: this._config.disabled,
    };

    return new SkyraBrowserLogger(
      childConfig,
      this._transport,
      this._queue,
      newContext
    );
  }

  public startTimer(name: string, options?: TimerOptions): TimerHandle {
    return startBrowserTimer(this, name, options);
  }

  public trackNavigation(payload: NavigationEventPayload): void {
    trackBrowserNavigation(this, payload);
  }

  public async flush(): Promise<void> {
    await this._queue.flush();
  }

  public async dispose(): Promise<void> {
    if (this._isDisposed) return;
    this._isDisposed = true;

    // Run cleanups (remove event listeners)
    for (const cleanup of this._cleanups) {
      try {
        cleanup();
      } catch {
        // Ignored
      }
    }
    this._cleanups.length = 0;

    await this._queue.dispose();
  }

  public getStatus(): BrowserLoggerStatus {
    return this._queue.getStatus();
  }
}

export function createSkyraBrowserLogger(
  config: SkyraBrowserLoggerConfig
): SkyraBrowserLogger {
  return new SkyraBrowserLogger(config);
}
