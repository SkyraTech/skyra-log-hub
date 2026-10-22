import type { LogLevel } from '@skyra/logger-core';
import type { TransportConfig, ResourceLimits } from '@skyra/logger-node';
export type LoggerTransportConfig = TransportConfig;
export type LoggerLimitsConfig = ResourceLimits;
export type ClockFunction = () => Date;
export interface NextHttpOptions {
    /** Whether automatic Route Handler logging is enabled. Default: true */
    enabled?: boolean;
    /** Paths or URL prefixes to exclude from HTTP logging (e.g. ['/api/health', '/_next']) */
    excludePaths?: readonly string[];
    /** Sampling rate between 0.0 and 1.0 (1.0 = log 100% of requests). Default: 1.0. (Errors >= 400 are NEVER sampled out) */
    sampleRate?: number;
    /** Whether to log request arrival events in addition to completion events. Default: false */
    logRequests?: boolean;
    /** Custom header names to inspect for incoming request IDs */
    requestIdHeaders?: readonly string[];
}
export interface NextSkyraLoggerOptions {
    /** Unique project identifier in lowercase kebab-case (e.g. 'skyra-portal') */
    projectId: string;
    /** Application or microservice name (e.g. 'portal-web') */
    serviceName: string;
    /** Deployment environment (e.g. 'local', 'development', 'staging', 'production') */
    environment: string;
    /** Server or instance identifier (e.g. 'portal-node-01' or process.env.INSTANCE_ID) */
    instanceId: string;
    /** Semantic version of service (e.g. '1.2.0') */
    serviceVersion?: string;
    /** Log level threshold (default: 'info') */
    level?: LogLevel;
    /** Transport configuration (stdout or jsonl file) */
    transport?: LoggerTransportConfig;
    /** HTTP Route Handler observability options */
    http?: NextHttpOptions;
    /** Bounded write queue and safety limits */
    limits?: Partial<LoggerLimitsConfig>;
    /** Additional domain-specific sensitive keys to scrub */
    additionalSensitiveKeys?: string[];
    /** Optional custom clock for deterministic testing */
    clock?: ClockFunction;
    /** Callback invoked when queue drops events under backpressure */
    onDrop?: (droppedCount: number) => void;
    /** Callback invoked on transport write errors */
    onError?: (error: Error) => void;
}
export declare const DEFAULT_NEXT_EXCLUDED_PATHS: readonly string[];
//# sourceMappingURL=config.d.ts.map