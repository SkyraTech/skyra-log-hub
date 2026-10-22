import {
  Injectable,
  Inject,
  Optional,
  LoggerService,
  OnApplicationShutdown,
  BeforeApplicationShutdown,
} from '@nestjs/common';
import type { LogLevel } from '@skyra/logger-core';
import type { SkyraLogger, LoggerStatus, LogContext } from '@skyra/logger-node';
import { SKYRA_LOGGER_INSTANCE } from './constants.js';
import { RequestContextService } from './context/request-context.service.js';
import { measureJob, JobTimerOptions } from './instrumentation/job-timer.js';
import { measureDatabase, DatabaseTimerOptions } from './instrumentation/database-timer.js';
import { measureOperation } from './instrumentation/operation-timer.js';

/**
 * Production-Grade NestJS Logger Service wrapping @skyra/logger-node.
 * Automatically injects active request correlation (traceId, spanId, requestId)
 * and provides lifecycle integration with graceful flush and close.
 */
@Injectable()
export class SkyraLoggerService implements LoggerService, OnApplicationShutdown, BeforeApplicationShutdown {
  private isShutdown = false;

  constructor(
    @Inject(SKYRA_LOGGER_INSTANCE) private readonly underlyingLogger: SkyraLogger,
    @Optional() private readonly requestContextService?: RequestContextService
  ) {}

  /**
   * Primary info-level logging method conforming to NestJS LoggerService interface.
   */
  public log(message: unknown, ...optionalParams: unknown[]): void {
    const { msg, metadata } = this.normalizeNestParams(message, optionalParams);
    this.info(msg, metadata);
  }

  /**
   * Error-level logging method conforming to NestJS LoggerService interface.
   */
  public error(message: unknown, ...optionalParams: unknown[]): void {
    const { msg, metadata } = this.normalizeNestParams(message, optionalParams);
    this.writeLog('error', msg, metadata);
  }

  /**
   * Warn-level logging method conforming to NestJS LoggerService interface.
   */
  public warn(message: unknown, ...optionalParams: unknown[]): void {
    const { msg, metadata } = this.normalizeNestParams(message, optionalParams);
    this.writeLog('warn', msg, metadata);
  }

  /**
   * Debug-level logging method conforming to NestJS LoggerService interface.
   */
  public debug(message: unknown, ...optionalParams: unknown[]): void {
    const { msg, metadata } = this.normalizeNestParams(message, optionalParams);
    this.writeLog('debug', msg, metadata);
  }

  /**
   * Verbose-level logging method conforming to NestJS LoggerService interface (maps to trace).
   */
  public verbose(message: unknown, ...optionalParams: unknown[]): void {
    const { msg, metadata } = this.normalizeNestParams(message, optionalParams);
    this.writeLog('trace', msg, metadata);
  }

  /**
   * Fatal-level logging method.
   */
  public fatal(message: unknown, ...optionalParams: unknown[]): void {
    const { msg, metadata } = this.normalizeNestParams(message, optionalParams);
    this.writeLog('fatal', msg, metadata);
  }

  /**
   * Canonical trace level logging.
   */
  public trace(message: string, metadata?: LogContext | string): void {
    const meta = typeof metadata === 'string' ? { context: metadata } : metadata;
    this.writeLog('trace', message, meta);
  }

  /**
   * Canonical info level logging.
   */
  public info(message: string, metadata?: LogContext | string): void {
    const meta = typeof metadata === 'string' ? { context: metadata } : metadata;
    this.writeLog('info', message, meta);
  }

  /**
   * Creates a contextual child logger inheriting parent configuration.
   */
  public child(childContext: LogContext): SkyraLoggerService {
    const childUnderlying = this.underlyingLogger.child(childContext);
    return new SkyraLoggerService(childUnderlying, this.requestContextService);
  }

  /**
   * Measures the monotonic duration and outcome of a background job.
   */
  public async measureJob<T>(name: string, fn: () => Promise<T>, options?: JobTimerOptions): Promise<T> {
    return measureJob(this.underlyingLogger, name, fn, options);
  }

  /**
   * Measures the monotonic duration and outcome of a database operation without logging raw parameters.
   */
  public async measureDatabase<T>(options: DatabaseTimerOptions, fn: () => Promise<T>): Promise<T> {
    return measureDatabase(this.underlyingLogger, options, fn);
  }

  /**
   * Measures the monotonic duration and outcome of any generic asynchronous operation.
   */
  public async measureOperation<T>(name: string, fn: () => Promise<T>, metadata?: LogContext): Promise<T> {
    return measureOperation(this.underlyingLogger, name, fn, metadata);
  }

  /**
   * Flushes all buffered log events to disk/transport.
   */
  public async flush(): Promise<void> {
    await this.underlyingLogger.flush();
  }

  /**
   * Gracefully flushes and closes transport file handles.
   */
  public async close(): Promise<void> {
    if (this.isShutdown) return;
    this.isShutdown = true;
    await this.underlyingLogger.close();
  }

  /**
   * Returns observable logger and transport metrics.
   */
  public getStatus(): LoggerStatus {
    return this.underlyingLogger.getStatus();
  }

  /**
   * Dynamically alters the minimum log level threshold.
   */
  public setLevel(level: LogLevel): void {
    this.underlyingLogger.setLevel(level);
  }

  /**
   * Checks if a severity level is enabled.
   */
  public isLevelEnabled(level: LogLevel): boolean {
    return this.underlyingLogger.isLevelEnabled(level);
  }

  /**
   * Direct access to underlying SkyraLogger instance.
   */
  public getUnderlyingLogger(): SkyraLogger {
    return this.underlyingLogger;
  }

  /**
   * NestJS BeforeApplicationShutdown hook.
   */
  public async beforeApplicationShutdown(signal?: string): Promise<void> {
    if (!this.isShutdown) {
      this.underlyingLogger.info(`Application shutdown initiated (signal: ${signal || 'none'})`, {
        action: 'application.shutdown.initiated',
        category: ['process'],
      });
      await this.flush();
    }
  }

  /**
   * NestJS OnApplicationShutdown hook.
   */
  public async onApplicationShutdown(signal?: string): Promise<void> {
    if (!this.isShutdown) {
      this.underlyingLogger.info(`Application shutdown completed (signal: ${signal || 'none'})`, {
        action: 'application.shutdown.completed',
        category: ['process'],
      });
      await this.close();
    }
  }

  /**
   * Internal write delegator that enriches log metadata with the active request context.
   */
  private writeLog(level: LogLevel, message: string, callerMetadata?: LogContext): void {
    // Clone metadata to prevent mutating caller inputs
    const enriched: LogContext = callerMetadata ? { ...callerMetadata } : {};

    // Enrich with active request context if available
    const store = this.requestContextService?.getStore();
    if (store) {
      if (store.traceId && !enriched.traceId) {
        enriched.traceId = store.traceId;
      }
      if (store.spanId && !enriched.spanId) {
        enriched.spanId = store.spanId;
      }
      if (store.requestId && (!enriched.http || !(enriched.http as Record<string, unknown>)['request'])) {
        enriched.labels = {
          ...enriched.labels,
          request_id: store.requestId,
        };
      }
      if (store.customContext && Object.keys(store.customContext).length > 0) {
        for (const [k, v] of Object.entries(store.customContext)) {
          if (enriched[k] === undefined) {
            enriched[k] = v;
          }
        }
      }
    }

    this.underlyingLogger.log(level, message, enriched);
  }

  /**
   * Normalizes NestJS Logger signature variations:
   * log(message, context)
   * error(message, trace, context)
   * log(message, ...params)
   */
  private normalizeNestParams(
    rawMessage: unknown,
    optionalParams: unknown[]
  ): { msg: string; metadata: LogContext } {
    const msg = typeof rawMessage === 'string' ? rawMessage : String(rawMessage);
    const metadata: LogContext = {};

    if (optionalParams.length === 0) {
      return { msg, metadata };
    }

    const first = optionalParams[0];
    const second = optionalParams[1];

    if (typeof first === 'string' && optionalParams.length === 1) {
      // e.g. logger.log('msg', 'ContextName')
      metadata.component = first;
    } else if (typeof first === 'string' && typeof second === 'string') {
      // e.g. logger.error('msg', 'stack_trace', 'ContextName')
      metadata.error = { stack_trace: first };
      metadata.component = second;
    } else if (typeof first === 'object' && first !== null) {
      if (first instanceof Error) {
        metadata.error = first;
      } else {
        Object.assign(metadata, first);
      }
      if (typeof second === 'string') {
        metadata.component = second;
      }
    } else if (optionalParams.length > 0) {
      metadata.args = optionalParams;
    }

    return { msg, metadata };
  }
}
