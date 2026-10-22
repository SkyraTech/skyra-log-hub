/**
 * Dependency injection tokens and shared constants for @skyra/logger-nestjs.
 */

export const SKYRA_LOGGER_OPTIONS = 'SKYRA_LOGGER_OPTIONS';
export const SKYRA_LOGGER_INSTANCE = 'SKYRA_LOGGER_INSTANCE';

/**
 * Symbol attached to the HTTP response or request to prevent duplicate completion events
 * between the interceptor and exception filter.
 */
export const HTTP_LOGGED_SYMBOL = Symbol('__skyra_http_logged__');

/**
 * W3C Traceparent Header Regex according to W3C Trace Context Level 1 / Level 2.
 * Format: {version}-{trace-id}-{parent-id}-{trace-flags}
 * - version: 2 hex characters (not 'ff')
 * - trace-id: 32 hex characters (cannot be all zeros)
 * - parent-id (span-id): 16 hex characters (cannot be all zeros)
 * - trace-flags: 2 hex characters
 */
export const W3C_TRACEPARENT_REGEX = /^([0-9a-fA-F]{2})-([0-9a-fA-F]{32})-([0-9a-fA-F]{16})-([0-9a-fA-F]{2})$/;

/**
 * Safe Request ID regex pattern allowing alphanumeric characters, hyphens, underscores, and dots (max 128 chars).
 */
export const SAFE_REQUEST_ID_REGEX = /^[a-zA-Z0-9_\-\.]{1,128}$/;

/**
 * Default excluded endpoints that are skipped by the HTTP logger by default.
 */
export const DEFAULT_EXCLUDED_PATHS: readonly string[] = Object.freeze([
  '/health',
  '/healthz',
  '/ready',
  '/readyz',
  '/live',
  '/livez',
  '/metrics',
  '/favicon.ico',
]);
