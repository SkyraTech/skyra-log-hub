/**
 * @skyra/logger-angular - Angular Injectable Logger Service
 */
import { OnDestroy } from '@angular/core';
import { SkyraBrowserLogger, type SkyraBrowserLoggerConfig, type LogLevel, type BrowserLoggerStatus, type TimerOptions, type TimerHandle, type NavigationEventPayload } from '@skyra/logger-browser';
export declare class SkyraLoggerService implements OnDestroy {
    private readonly _logger;
    constructor(config?: SkyraBrowserLoggerConfig);
    get underlyingLogger(): SkyraBrowserLogger;
    isLevelEnabled(level: LogLevel): boolean;
    setLevel(level: LogLevel): void;
    getLevel(): LogLevel;
    log(level: LogLevel, message: unknown, metadata?: Record<string, unknown>): boolean;
    trace(message: unknown, metadata?: Record<string, unknown>): boolean;
    debug(message: unknown, metadata?: Record<string, unknown>): boolean;
    info(message: unknown, metadata?: Record<string, unknown>): boolean;
    warn(message: unknown, metadata?: Record<string, unknown>): boolean;
    error(message: unknown, metadata?: Record<string, unknown>): boolean;
    fatal(message: unknown, metadata?: Record<string, unknown>): boolean;
    child(context: {
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
    ngOnDestroy(): void;
}
//# sourceMappingURL=skyra-logger.service.d.ts.map