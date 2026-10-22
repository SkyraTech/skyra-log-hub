import type { Type } from '@nestjs/common';
import type { ModuleMetadata } from '@nestjs/common';
import type { SkyraLoggerConfig } from '@skyra/logger-node';

/**
 * Options configuring automatic HTTP request and response observability in NestJS.
 */
export interface SkyraHttpOptions {
  /**
   * Whether automatic HTTP logging is enabled.
   * Default: true
   */
  enabled?: boolean;

  /**
   * Whether to emit a log event when a request is first received.
   * Default: false (completion log is standard to capture duration and outcome)
   */
  logRequests?: boolean;

  /**
   * Whether to emit a log event when the HTTP request finishes.
   * Default: true
   */
  logResponses?: boolean;

  /**
   * Whether to measure and attach monotonic duration fields (`skyra.duration_ms` and `event.duration`).
   * Default: true
   */
  captureDuration?: boolean;

  /**
   * Array of URL paths or prefixes to exclude from automatic HTTP logging (e.g. ['/health', '/metrics']).
   * Default: ['/health', '/healthz', '/ready', '/readyz', '/live', '/livez', '/metrics', '/favicon.ico']
   */
  excludePaths?: string[];

  /**
   * Probabilistic sampling rate between 0.0 and 1.0 for successful HTTP requests (2xx, 3xx).
   * Default: 1.0 (100% of requests logged).
   * Note: Client errors (4xx) and server errors (5xx) are ALWAYS logged regardless of sampleRate.
   */
  sampleRate?: number;

  /**
   * Whether to automatically register global APP_INTERCEPTOR and APP_FILTER providers in the NestJS container.
   * Default: true
   */
  autoRegisterGlobalInterceptors?: boolean;
}

/**
 * Full configuration options for SkyraLoggerModule in NestJS.
 * Combines underlying SkyraLoggerConfig with NestJS-specific HTTP options.
 */
export interface SkyraLoggerOptions extends SkyraLoggerConfig {
  /**
   * NestJS HTTP request/response observability options.
   */
  http?: SkyraHttpOptions;
}

/**
 * Interface implemented by classes that provide SkyraLoggerOptions asynchronously.
 */
export interface SkyraLoggerOptionsFactory {
  createSkyraLoggerOptions(): Promise<SkyraLoggerOptions> | SkyraLoggerOptions;
}

/**
 * Options for dynamic async module registration via `SkyraLoggerModule.forRootAsync()`.
 */
export interface SkyraLoggerModuleAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
  /**
   * Make the module global so that SkyraLoggerService and RequestContextService
   * are available throughout the application without re-importing SkyraLoggerModule.
   * Default: true
   */
  isGlobal?: boolean;

  /**
   * Existing provider to use for logger options.
   */
  useExisting?: Type<SkyraLoggerOptionsFactory>;

  /**
   * Class to instantiate and use for logger options.
   */
  useClass?: Type<SkyraLoggerOptionsFactory>;

  /**
   * Factory function returning logger options.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useFactory?: (...args: any[]) => Promise<SkyraLoggerOptions> | SkyraLoggerOptions;

  /**
   * Providers to inject into the useFactory function.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inject?: any[];
}
