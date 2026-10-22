/**
 * @skyra/logger-browser - Configuration Resolver and Validator
 */
import type { LogLevel, SkyraBrowserLoggerConfig, BrowserTransportConfig, BrowserTransport, BrowserCaptureConfig, BrowserRedactionConfig } from './types.js';
export interface ResolvedBrowserLimits {
    readonly maxMessageLength: number;
    readonly maxEventSizeBytes: number;
    readonly maxMetadataDepth: number;
    readonly maxObjectKeys: number;
    readonly maxArrayLength: number;
    readonly maxQueueEvents: number;
    readonly maxQueueBytes: number;
}
export interface ResolvedBrowserConfig {
    readonly projectId: string;
    readonly serviceName: string;
    readonly environment: string;
    readonly level: LogLevel;
    readonly serviceVersion?: string;
    readonly component?: string;
    readonly includeUserAgent: boolean;
    readonly transport: BrowserTransportConfig | BrowserTransport;
    readonly capture: Required<BrowserCaptureConfig>;
    readonly limits: ResolvedBrowserLimits;
    readonly redaction: BrowserRedactionConfig;
    readonly immediateFlushLevels: ReadonlySet<LogLevel>;
    readonly disabled: boolean;
    readonly validateEvents: boolean;
}
export declare function resolveBrowserConfig(raw: SkyraBrowserLoggerConfig): ResolvedBrowserConfig;
//# sourceMappingURL=config.d.ts.map