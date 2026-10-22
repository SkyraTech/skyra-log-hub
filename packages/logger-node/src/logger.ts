import type { LogLevel } from '@skyra/logger-core';
import { normalizeEnvironment } from '@skyra/logger-core';
import type {
  SkyraLoggerConfig,
  ResolvedSkyraLoggerConfig,
  ResourceLimits,
} from './config.js';
import { DEFAULT_RESOURCE_LIMITS } from './config.js';
import type { LogContext } from './event-builder.js';
import { buildCanonicalLogEvent } from './event-builder.js';
import { formatJsonlEvent } from './formatter.js';
import { WriteQueue } from './internal/write-queue.js';
import type { SkyraTransport } from './transports/transport.interface.js';
import { StdoutTransport } from './transports/stdout.transport.js';
import { JsonlFileTransport } from './transports/jsonl-file.transport.js';
import { emitInternalDiagnostic } from './internal/diagnostics.js';

const SEVERITY_ORDER: Record<LogLevel, number> = {
  fatal: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
  trace: 5,
};

export interface LoggerStatus {
  projectId: string;
  serviceName: string;
  environment: string;
  instanceId: string;
  level: LogLevel;
  isClosed: boolean;
  totalEventsSubmitted: number;
  totalEventsAccepted: number;
  totalEventsDropped: number;
  droppedEventsCount: number;
  pendingQueueCount: number;
  pendingQueueBytes: number;
  totalEventsWritten: number;
  totalBytesWritten: number;
  totalEventsFsynced: number;
  activeFile?: string;
}

export class SkyraLogger {
  private readonly config: ResolvedSkyraLoggerConfig;
  private readonly transport: SkyraTransport;
  private readonly writeQueue: WriteQueue;
  private currentLevelValue: number;
  private isClosed = false;
  private totalEventsSubmitted = 0;

  constructor(
    config: ResolvedSkyraLoggerConfig,
    transport?: SkyraTransport,
    writeQueue?: WriteQueue,
    private readonly parentContext?: LogContext
  ) {
    this.config = config;
    this.currentLevelValue = SEVERITY_ORDER[config.level] ?? SEVERITY_ORDER.info;

    if (transport) {
      this.transport = transport;
    } else {
      // Instantiate transport based on configuration
      if (config.transport.type === 'file') {
        this.transport = new JsonlFileTransport(config, config.transport);
      } else {
        this.transport = new StdoutTransport();
      }
    }

    if (writeQueue) {
      this.writeQueue = writeQueue;
    } else {
      this.writeQueue = new WriteQueue(
        config.limits,
        async (batch) => {
          for (const item of batch) {
            try {
              await this.transport.write(item.level, item.line, item.bytes);
            } catch (err) {
              if (this.config.onError && err instanceof Error) {
                try {
                  this.config.onError(err);
                } catch {
                  // Prevent user error handler from crashing logger
                }
              }
              throw err;
            }
          }
        },
        (emergencyItem) => {
          this.transport.emergencyWrite(emergencyItem.level, emergencyItem.line, emergencyItem.bytes);
        },
        config.onDrop
      );
    }
  }

  /**
   * Checks whether the specified log severity is enabled under the current configuration.
   */
  public isLevelEnabled(level: LogLevel): boolean {
    const val = SEVERITY_ORDER[level];
    if (val === undefined) return false;
    return val <= this.currentLevelValue;
  }

  /**
   * Dynamically alters the active logging threshold.
   */
  public setLevel(level: LogLevel): void {
    const val = SEVERITY_ORDER[level];
    if (val !== undefined) {
      this.currentLevelValue = val;
      this.config.level = level;
    } else {
      emitInternalDiagnostic('InvalidLevel', `Attempted to set invalid log level '${level}'`);
    }
  }

  public trace(message: string, metadata?: LogContext): void {
    this.log('trace', message, metadata);
  }

  public debug(message: string, metadata?: LogContext): void {
    this.log('debug', message, metadata);
  }

  public info(message: string, metadata?: LogContext): void {
    this.log('info', message, metadata);
  }

  public warn(message: string, metadata?: LogContext): void {
    this.log('warn', message, metadata);
  }

  public error(message: string, metadata?: LogContext): void {
    this.log('error', message, metadata);
  }

  public fatal(message: string, metadata?: LogContext): void {
    this.log('fatal', message, metadata);
  }

  /**
   * Core logging method.
   * Performs:
   * 1. Early severity filtering
   * 2. Canonical event construction & UUID generation
   * 3. Deep redaction
   * 4. Single-line JSONL serialization
   * 5. Enforcement of maxEventSizeBytes
   * 6. Enqueue to bounded background write queue
   *
   * Non-blocking: Returns synchronously.
   */
  public log(level: LogLevel, message: string, metadata?: LogContext): void {
    this.totalEventsSubmitted++;

    if (this.isClosed) {
      emitInternalDiagnostic('WriteAfterClose', `Log call ignored: logger is closed (level=${level})`);
      this.writeQueue.recordDrop(1, 'Write attempted after logger closed');
      return;
    }

    // Fast-path log level filter: avoid serialization and cloning if filtered out
    if (!this.isLevelEnabled(level)) {
      return;
    }

    try {
      // Build canonical ECS event
      const event = buildCanonicalLogEvent(
        this.config,
        level,
        message,
        metadata,
        this.parentContext
      );

      // Serialize to JSONL line
      const strictMode = this.config.validationMode === 'strict';
      const line = formatJsonlEvent(event, strictMode);
      const lineBytes = Buffer.byteLength(line, 'utf-8');

      // Check maxEventSizeBytes constraint
      if (lineBytes > this.config.limits.maxEventSizeBytes) {
        const reason = `Event size ${lineBytes} bytes exceeds maxEventSizeBytes ${this.config.limits.maxEventSizeBytes}`;
        emitInternalDiagnostic('OversizedEventDropped', reason);

        if (level === 'error' || level === 'fatal') {
          // Attempt minimal fallback event for critical log
          const fallbackEvent = buildCanonicalLogEvent(
            this.config,
            level,
            '[Oversized event omitted payload]',
            { originalMessagePrefix: message.slice(0, 512) },
            this.parentContext
          );
          const fallbackLine = formatJsonlEvent(fallbackEvent, false);
          if (Buffer.byteLength(fallbackLine, 'utf-8') <= this.config.limits.maxEventSizeBytes) {
            this.writeQueue.enqueue(level, fallbackLine);
            return;
          }
        }

        this.writeQueue.recordDrop(1, reason);
        return;
      }

      // Enqueue to write queue
      this.writeQueue.enqueue(level, line);
    } catch (err) {
      emitInternalDiagnostic('LogEventFailed', `Failed processing log event (level=${level})`, err);
      if (this.config.onError && err instanceof Error) {
        try {
          this.config.onError(err);
        } catch {
          // Prevent user callback failure from cascading
        }
      }
    }
  }

  /**
   * Creates a contextual child logger inheriting parent configuration and context.
   * Child operations do not mutate the parent logger instance.
   */
  public child(childContext: LogContext): SkyraLogger {
    const mergedContext: LogContext = {
      ...this.parentContext,
      ...childContext,
    };
    return new SkyraLogger(this.config, this.transport, this.writeQueue, mergedContext);
  }

  /**
   * Flushes all in-memory queue entries to the transport and synchronizes storage.
   */
  public async flush(): Promise<void> {
    await this.writeQueue.flush();
    await this.transport.flush();
  }

  /**
   * Gracefully flushes and closes file handles. Rejects subsequent writes.
   */
  public async close(): Promise<void> {
    if (this.isClosed) return;
    this.isClosed = true;

    await this.writeQueue.close();
    await this.transport.close();
  }

  /**
   * Returns observable status for health metrics and diagnostics.
   */
  public getStatus(): LoggerStatus {
    const queueStats = this.writeQueue.getStats();
    const transportStats = this.transport.getStatus();

    return {
      projectId: this.config.projectId,
      serviceName: this.config.serviceName,
      environment: this.config.environment,
      instanceId: this.config.instanceId,
      level: this.config.level,
      isClosed: this.isClosed || queueStats.isClosed,
      totalEventsSubmitted: this.totalEventsSubmitted,
      totalEventsAccepted: queueStats.acceptedCount,
      totalEventsDropped: queueStats.droppedCount,
      droppedEventsCount: queueStats.droppedCount,
      pendingQueueCount: queueStats.pendingCount,
      pendingQueueBytes: queueStats.pendingBytes,
      totalEventsWritten: transportStats.totalEventsWritten,
      totalBytesWritten: transportStats.totalBytesWritten,
      totalEventsFsynced: transportStats.totalEventsFsynced,
      activeFile: transportStats.currentActiveFile,
    };
  }

  /**
   * Access to underlying transport for testing and verification.
   */
  public getTransport(): SkyraTransport {
    return this.transport;
  }
}

/**
 * Resolves user options with production-grade defaults.
 */
function resolveConfig(raw: SkyraLoggerConfig): ResolvedSkyraLoggerConfig {
  const limits: ResourceLimits = {
    ...DEFAULT_RESOURCE_LIMITS,
    ...raw.limits,
  };

  const fsyncOnLevels = new Set<LogLevel>(raw.fsyncOnLevels ?? ['error', 'fatal']);

  return {
    projectId: raw.projectId,
    serviceName: raw.serviceName,
    environment: normalizeEnvironment(raw.environment),
    instanceId: raw.instanceId,
    serviceVersion: raw.serviceVersion,
    nodeName: raw.nodeName,
    level: raw.level ?? 'info',
    transport: raw.transport ?? { type: 'stdout' },
    additionalSensitiveKeys: raw.additionalSensitiveKeys ?? [],
    limits,
    fsyncOnLevels,
    clock: raw.clock ?? (() => new Date()),
    validationMode: raw.validationMode ?? 'off',
    onDrop: raw.onDrop,
    onError: raw.onError,
  };
}

/**
 * Factory function creating a production-grade SkyraLogger instance.
 */
export function createSkyraLogger(config: SkyraLoggerConfig): SkyraLogger {
  const resolved = resolveConfig(config);
  return new SkyraLogger(resolved);
}
