/**
 * @skyra/logger-browser - Canonical Event Builder and Envelope Defense
 */
import type { SkyraLogEvent, LogLevel, EventOutcome } from '@skyra/logger-core/types';
import type { ResolvedBrowserConfig } from './config.js';
import type { BrowserContextData } from './context.js';
export interface EventBuilderOptions {
    readonly level: LogLevel;
    readonly message: unknown;
    readonly metadata?: Record<string, unknown>;
    readonly context?: BrowserContextData;
    readonly error?: Error | unknown;
    readonly action?: string;
    readonly outcome?: EventOutcome;
    readonly durationNs?: number;
    readonly durationMs?: number;
    readonly route?: string;
    readonly component?: string;
    readonly http?: Record<string, unknown>;
}
export declare function buildBrowserLogEvent(config: ResolvedBrowserConfig, options: EventBuilderOptions): SkyraLogEvent;
//# sourceMappingURL=event-builder.d.ts.map