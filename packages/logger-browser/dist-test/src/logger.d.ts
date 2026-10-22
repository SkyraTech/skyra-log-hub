/**
 * @skyra/logger-browser - Main SkyraBrowserLogger Implementation
 */
import type { LogLevel } from '@skyra/logger-core/types';
import type { SkyraBrowserLoggerConfig, BrowserLoggerStatus, TimerOptions, TimerHandle, NavigationEventPayload } from './types.js';
import { BrowserContext } from './context.js';
import { BatchQueue } from './internal/batch-queue.js';
import type { BrowserTransport } from './transports/transport.interface.js';
export declare class SkyraBrowserLogger {
    private readonly _config;
    private readonly _transport;
    private readonly _queue;
    private readonly _context;
    private _currentLevel;
    private _isDisposed;
    private readonly _cleanups;
    constructor(config: SkyraBrowserLoggerConfig, injectedTransport?: BrowserTransport, injectedQueue?: BatchQueue, injectedContext?: BrowserContext);
    isLevelEnabled(level: LogLevel): boolean;
    setLevel(level: LogLevel): void;
    getLevel(): LogLevel;
    getContext(): BrowserContext;
    log(level: LogLevel, message: unknown, metadata?: Record<string, unknown>): boolean;
    trace(message: unknown, metadata?: Record<string, unknown>): boolean;
    debug(message: unknown, metadata?: Record<string, unknown>): boolean;
    info(message: unknown, metadata?: Record<string, unknown>): boolean;
    warn(message: unknown, metadata?: Record<string, unknown>): boolean;
    error(message: unknown, metadata?: Record<string, unknown>): boolean;
    fatal(message: unknown, metadata?: Record<string, unknown>): boolean;
    child(childContext: {
        component?: string;
        labels?: Record<string, string>;
        tags?: readonly string[];
        custom?: Record<string, unknown>;
    }): SkyraBrowserLogger;
    startTimer(name: string, options?: TimerOptions): TimerHandle;
    trackNavigation(payload: NavigationEventPayload): void;
    flush(): Promise<void>;
    dispose(): Promise<void>;
    getStatus(): BrowserLoggerStatus;
}
export declare function createSkyraBrowserLogger(config: SkyraBrowserLoggerConfig): SkyraBrowserLogger;
//# sourceMappingURL=logger.d.ts.map