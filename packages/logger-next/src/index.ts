/**
 * @skyra/logger-next
 * Production-grade Next.js server-side logging adapter, route handler instrumentation,
 * and automatic API observability for Skyra LogHub.
 */

// Core types re-exports
export type {
  LogLevel,
  SkyraLogEvent,
  EcsEvent,
  EcsService,
  SkyraMetadata,
} from '@skyra/logger-core';

// Configuration
export type {
  NextSkyraLoggerOptions,
  NextHttpOptions,
  LoggerTransportConfig,
  LoggerLimitsConfig,
} from './config.js';
export { DEFAULT_NEXT_EXCLUDED_PATHS } from './config.js';

// Logger
export {
  SkyraNextLogger,
  createNextSkyraLogger,
  getSkyraServerLogger,
} from './logger.js';

// Route Handlers
export {
  withSkyraLogging,
  HTTP_LOGGED_SYMBOL,
} from './route-handler.js';
export type {
  RouteHandlerOptions,
  RouteHandlerFn,
} from './route-handler.js';

// Server Actions
export {
  withSkyraAction,
} from './server-action.js';
export type {
  ServerActionOptions,
} from './server-action.js';

// Instrumentation hooks
export {
  registerSkyraInstrumentation,
  createSkyraRequestErrorHandler,
} from './instrumentation.js';
export type {
  NextRequestErrorInfo,
  NextErrorContextInfo,
  NextRequestErrorHandler,
} from './instrumentation.js';

// Request Context & Distributed Tracing
export {
  runWithRequestContext,
  getNextRequestContext,
  getActiveRequestId,
  getActiveTraceId,
  getActiveSpanId,
  getActiveElapsedMs,
  setRequestContextValue,
} from './request-context.js';
export type {
  NextRequestContextStore,
} from './request-context.js';

// Timing & Telemetry
export {
  measureDatabase,
  measureOperation,
  measureJob,
} from './timing.js';
export type {
  DatabaseSystem,
  DatabaseTimerOptions,
  JobTimerOptions,
} from './timing.js';

// Runtime utilities
export {
  isEdgeRuntime,
  isNodeRuntime,
  isServerlessRuntime,
} from './internal/runtime.js';

// Sanitization utilities
export {
  sanitizeRouteTemplate,
} from './internal/route-sanitizer.js';
export {
  sanitizeError,
} from './internal/error-sanitizer.js';
export type {
  SanitizedErrorInfo,
} from './internal/error-sanitizer.js';

// Correlation utilities
export {
  extractTraceparent,
  resolveRequestId,
  generateTraceId,
  generateSpanId,
  W3C_TRACEPARENT_REGEX,
  SAFE_REQUEST_ID_REGEX,
} from './internal/correlation.js';
export type {
  TraceContext,
} from './internal/correlation.js';
