/**
 * @skyra/logger-browser - Types and Interfaces
 */

import type {
  SkyraLogEvent,
  LogLevel,
  CanonicalEnvironment,
  Environment,
  EventOutcome,
  EcsError,
} from '@skyra/logger-core/types';

export type {
  SkyraLogEvent,
  LogLevel,
  CanonicalEnvironment,
  Environment,
  EventOutcome,
  EcsError,
};

export interface BrowserTransportResult {
  readonly success: boolean;
  readonly deliveredCount: number;
  readonly droppedCount: number;
  readonly retryable: boolean;
  readonly error?: string;
  readonly statusCode?: number;
}

export interface BrowserTransport {
  readonly name: string;
  send(batch: readonly SkyraLogEvent[]): Promise<BrowserTransportResult>;
  flush?(): Promise<void>;
  dispose?(): Promise<void>;
}

export interface MemoryTransportConfig {
  readonly type: 'memory';
  readonly maxEvents?: number;
}

export interface ConsoleTransportConfig {
  readonly type: 'console';
  readonly levels?: readonly LogLevel[];
  readonly useColors?: boolean;
}

export interface HttpTransportRetryConfig {
  readonly maxRetries?: number;
  readonly initialDelayMs?: number;
  readonly maxDelayMs?: number;
  readonly backoffMultiplier?: number;
}

export interface HttpTransportConfig {
  readonly type: 'http';
  readonly url: string;
  readonly headers?: Record<string, string>;
  readonly allowedOrigins?: readonly string[];
  readonly rejectInsecureHttp?: boolean; // defaults to true in non-localhost
  readonly credentials?: 'omit' | 'same-origin' | 'include'; // defaults to 'omit'
  readonly maxBatchSize?: number; // default 100
  readonly maxBatchBytes?: number; // default 256 KiB
  readonly flushIntervalMs?: number; // default 5000 ms
  readonly retry?: HttpTransportRetryConfig;
  readonly useBeaconOnUnload?: boolean; // default true
}

export type BrowserTransportConfig =
  | MemoryTransportConfig
  | ConsoleTransportConfig
  | HttpTransportConfig;

export interface BrowserCaptureConfig {
  readonly globalErrors?: boolean;
  readonly unhandledRejections?: boolean;
  readonly navigation?: boolean;
}

export interface BrowserLimitsConfig {
  readonly maxMessageLength?: number; // default 8192
  readonly maxEventSizeBytes?: number; // default 256 KiB
  readonly maxMetadataDepth?: number; // default 8
  readonly maxObjectKeys?: number; // default 100
  readonly maxArrayLength?: number; // default 100
  readonly maxQueueEvents?: number; // default 1000
  readonly maxQueueBytes?: number; // default 4 MiB
}

export interface BrowserRedactionConfig {
  readonly additionalKeys?: readonly string[];
  readonly maskValue?: string;
}

export interface SkyraBrowserLoggerConfig {
  readonly projectId: string;
  readonly serviceName: string;
  readonly environment: string;
  readonly level?: LogLevel;
  readonly serviceVersion?: string;
  readonly component?: string;
  readonly includeUserAgent?: boolean;
  readonly transport?: BrowserTransportConfig | BrowserTransport;
  readonly capture?: BrowserCaptureConfig;
  readonly limits?: BrowserLimitsConfig;
  readonly redaction?: BrowserRedactionConfig;
  readonly immediateFlushLevels?: readonly LogLevel[];
  readonly disabled?: boolean;
  readonly validateEvents?: boolean; // defaults to true
}

export interface BrowserLoggerStatus {
  readonly acceptedCount: number;
  readonly deliveredCount: number;
  readonly droppedCount: number;
  readonly evictedCount: number;
  readonly failedCount: number;
  readonly queueDepth: number;
  readonly queueBytes: number;
  readonly isDisposed: boolean;
}

export interface TimerOptions {
  readonly component?: string;
  readonly metadata?: Record<string, unknown>;
  readonly traceId?: string;
  readonly spanId?: string;
}

export interface TimerStopOptions {
  readonly outcome?: EventOutcome;
  readonly metadata?: Record<string, unknown>;
  readonly error?: Error | unknown;
}

export interface TimerHandle {
  stop(options?: TimerStopOptions): number;
}

export interface NavigationEventPayload {
  readonly route: string;
  readonly previousRoute?: string;
  readonly action?: string;
  readonly outcome?: EventOutcome;
  readonly metadata?: Record<string, unknown>;
}

export interface BrowserTraceContext {
  readonly traceId?: string;
  readonly spanId?: string;
  readonly correlationId?: string;
}
