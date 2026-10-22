import type { LogLevel } from '@skyra/logger-core';
import { createSkyraLogger, SkyraLogger, type LogContext, type LoggerStatus } from '@skyra/logger-node';
import type { NextSkyraLoggerOptions } from './config.js';
import { isServerlessRuntime, isEdgeRuntime } from './internal/runtime.js';
import { getGlobalNextLogger, setGlobalNextLogger } from './internal/singleton.js';
import { getNextRequestContext } from './request-context.js';
import { reportDiagnostic } from './internal/diagnostics.js';

/**
 * Production-grade Next.js Logger wrapping SkyraLogger.
 * Seamlessly enriches log events with active Next.js request correlation context.
 */
export class SkyraNextLogger {
  private readonly underlying: SkyraLogger;
  private readonly options: NextSkyraLoggerOptions;

  constructor(underlying: SkyraLogger, options: NextSkyraLoggerOptions) {
    this.underlying = underlying;
    this.options = options;
  }

  public getUnderlying(): SkyraLogger {
    return this.underlying;
  }

  public getOptions(): NextSkyraLoggerOptions {
    return this.options;
  }

  public trace(message: unknown, metadata?: LogContext): void {
    this.log('trace', message, metadata);
  }

  public debug(message: unknown, metadata?: LogContext): void {
    this.log('debug', message, metadata);
  }

  public info(message: unknown, metadata?: LogContext): void {
    this.log('info', message, metadata);
  }

  public warn(message: unknown, metadata?: LogContext): void {
    this.log('warn', message, metadata);
  }

  public error(message: unknown, metadata?: LogContext, trace?: string): void {
    let context: LogContext = metadata ? { ...metadata } : {};
    if (trace && !context.error) {
      context.error = { stack: trace };
    }
    this.log('error', message, context);
  }

  public fatal(message: unknown, metadata?: LogContext): void {
    this.log('fatal', message, metadata);
  }

  public log(level: LogLevel, message: unknown, metadata?: LogContext): void {
    const enriched = this.enrichWithRequestContext(metadata);
    const msgStr = typeof message === 'string' ? message : String(message ?? '');
    this.underlying.log(level, msgStr, enriched);
  }

  public child(childContext: LogContext): SkyraNextLogger {
    const childUnderlying = this.underlying.child(childContext);
    return new SkyraNextLogger(childUnderlying, this.options);
  }

  public async flush(): Promise<void> {
    await this.underlying.flush();
  }

  public async close(): Promise<void> {
    await this.underlying.close();
  }

  public getStatus(): LoggerStatus {
    return this.underlying.getStatus();
  }

  private enrichWithRequestContext(metadata?: LogContext): LogContext {
    const store = getNextRequestContext();
    if (!store) {
      return metadata ?? {};
    }

    const enriched: LogContext = {};
    if (store.traceId) {
      enriched.traceId = store.traceId;
    }
    if (store.spanId) {
      enriched.spanId = store.spanId;
    }
    if (store.requestId) {
      enriched.labels = { request_id: store.requestId };
    }
    if (store.customContext && Object.keys(store.customContext).length > 0) {
      Object.assign(enriched, store.customContext);
    }
    if (metadata) {
      Object.assign(enriched, metadata);
    }
    return enriched;
  }
}

/**
 * Creates or reuses a singleton SkyraNextLogger for Next.js application runtimes.
 * Supports development hot-reload reuse and serverless stdout defaults.
 */
export function createNextSkyraLogger(options: NextSkyraLoggerOptions): SkyraNextLogger {
  // Edge runtime guard
  if (isEdgeRuntime()) {
    reportDiagnostic('EdgeRuntimeNotice', 'Running inside Edge runtime. File transports are disabled.');
  }

  // Hot reload reuse: avoid recreating instance if already initialized with matching project/service
  const existing = getGlobalNextLogger();
  if (existing) {
    const existingOpts = existing.getOptions();
    if (existingOpts.projectId === options.projectId && existingOpts.serviceName === options.serviceName) {
      return existing;
    }
  }

  // Serverless defaults: default transport to stdout unless explicitly configured
  let transport = options.transport;
  if (!transport) {
    if (isServerlessRuntime() || isEdgeRuntime()) {
      transport = { type: 'stdout' };
    } else {
      transport = {
        type: 'file',
        directory: './logs',
      };
    }
  }

  const underlying = createSkyraLogger({
    projectId: options.projectId,
    serviceName: options.serviceName,
    environment: options.environment as any,
    instanceId: options.instanceId,
    serviceVersion: options.serviceVersion,
    level: options.level ?? 'info',
    transport,
    limits: options.limits,
    additionalSensitiveKeys: options.additionalSensitiveKeys,
    clock: options.clock,
    onDrop: options.onDrop,
    onError: options.onError,
  });

  const resolvedOptions: NextSkyraLoggerOptions = {
    ...options,
    transport,
  };

  const nextLogger = new SkyraNextLogger(underlying, resolvedOptions);
  setGlobalNextLogger(nextLogger);
  return nextLogger;
}

/**
 * Retrieves the registered singleton server logger.
 * If not yet initialized, initializes a sensible fallback instance.
 */
export function getSkyraServerLogger(): SkyraNextLogger {
  const existing = getGlobalNextLogger();
  if (existing) {
    return existing;
  }

  // Fallback initialization
  const logDir = process.env.SKYRA_LOG_DIRECTORY || process.env.SKYRA_TEST_LOG_DIR;
  const transport = logDir ? { type: 'file' as const, directory: logDir } : { type: 'stdout' as const };

  return createNextSkyraLogger({
    projectId: process.env.SKYRA_PROJECT_ID || 'skyra-next',
    serviceName: process.env.SKYRA_SERVICE_NAME || 'nextjs-app',
    environment: (process.env.NODE_ENV || 'development') as any,
    instanceId: process.env.INSTANCE_ID || `next-${process.pid || 'server'}`,
    level: (process.env.LOG_LEVEL as LogLevel) || 'info',
    transport,
  });
}
