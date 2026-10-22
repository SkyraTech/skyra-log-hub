import type { LogLevel } from '@skyra/logger-core';
import { SkyraLogger, type LogContext, type LoggerStatus } from '@skyra/logger-node';
import type { NextSkyraLoggerOptions } from './config.js';
/**
 * Production-grade Next.js Logger wrapping SkyraLogger.
 * Seamlessly enriches log events with active Next.js request correlation context.
 */
export declare class SkyraNextLogger {
    private readonly underlying;
    private readonly options;
    constructor(underlying: SkyraLogger, options: NextSkyraLoggerOptions);
    getUnderlying(): SkyraLogger;
    getOptions(): NextSkyraLoggerOptions;
    trace(message: unknown, metadata?: LogContext): void;
    debug(message: unknown, metadata?: LogContext): void;
    info(message: unknown, metadata?: LogContext): void;
    warn(message: unknown, metadata?: LogContext): void;
    error(message: unknown, metadata?: LogContext, trace?: string): void;
    fatal(message: unknown, metadata?: LogContext): void;
    log(level: LogLevel, message: unknown, metadata?: LogContext): void;
    child(childContext: LogContext): SkyraNextLogger;
    flush(): Promise<void>;
    close(): Promise<void>;
    getStatus(): LoggerStatus;
    private enrichWithRequestContext;
}
/**
 * Creates or reuses a singleton SkyraNextLogger for Next.js application runtimes.
 * Supports development hot-reload reuse and serverless stdout defaults.
 */
export declare function createNextSkyraLogger(options: NextSkyraLoggerOptions): SkyraNextLogger;
/**
 * Retrieves the registered singleton server logger.
 * If not yet initialized, initializes a sensible fallback instance.
 */
export declare function getSkyraServerLogger(): SkyraNextLogger;
//# sourceMappingURL=logger.d.ts.map