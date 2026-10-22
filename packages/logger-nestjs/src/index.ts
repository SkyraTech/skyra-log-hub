/**
 * @skyra/logger-nestjs
 * Production-Grade NestJS Logging Adapter & Automatic API Observability for Skyra LogHub
 */

export * from './constants.js';
export * from './skyra-logger.options.js';
export * from './skyra-logger.service.js';
export * from './skyra-logger.module.js';

// Context
export * from './context/request-context.service.js';

// Middleware, Interceptors & Filters
export * from './middleware/correlation.middleware.js';
export * from './interceptors/http-logging.interceptor.js';
export * from './filters/http-exception.filter.js';

// Instrumentation Helpers
export * from './instrumentation/job-timer.js';
export * from './instrumentation/database-timer.js';
export * from './instrumentation/operation-timer.js';

// Internal Utilities
export * from './internal/route-sanitizer.js';
export * from './internal/error-sanitizer.js';
export * from './internal/http-event-builder.js';

// Re-export common types from underlying packages for consumer convenience
export type {
  LogLevel,
  CanonicalEnvironment,
  LegacyEnvironment,
} from '@skyra/logger-core';

export type {
  SkyraLogger,
  LoggerStatus,
  LogContext,
  ResourceLimits,
  FileTransportConfig,
  StdoutTransportConfig,
  TransportConfig,
} from '@skyra/logger-node';

export { createSkyraLogger } from '@skyra/logger-node';
