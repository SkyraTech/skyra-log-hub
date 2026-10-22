import * as crypto from 'node:crypto';

export const W3C_TRACEPARENT_REGEX = /^([0-9a-fA-F]{2})-([0-9a-fA-F]{32})-([0-9a-fA-F]{16})-([0-9a-fA-F]{2})$/;
export const SAFE_REQUEST_ID_REGEX = /^[a-zA-Z0-9_\-\.]{1,128}$/;

const ALL_ZERO_TRACE = '00000000000000000000000000000000';
const ALL_ZERO_SPAN = '0000000000000000';

export interface TraceContext {
  traceId: string;
  spanId: string;
}

/**
 * Extracts and strictly validates incoming W3C traceparent header adhering to W3C Trace Context spec.
 * Returns undefined if absent, malformed, forbidden version 'ff', or all-zero IDs.
 */
export function extractTraceparent(header?: string | null): TraceContext | undefined {
  if (!header || typeof header !== 'string') {
    return undefined;
  }

  const trimmed = header.trim();
  const match = trimmed.match(W3C_TRACEPARENT_REGEX);
  if (!match) {
    return undefined;
  }

  const version = match[1]?.toLowerCase();
  const traceId = match[2]?.toLowerCase();
  const spanId = match[3]?.toLowerCase();

  // Version 'ff' is forbidden by W3C specification
  if (version === 'ff') {
    return undefined;
  }

  // All-zero identifiers are invalid
  if (!traceId || traceId === ALL_ZERO_TRACE) {
    return undefined;
  }

  if (!spanId || spanId === ALL_ZERO_SPAN) {
    return undefined;
  }

  return { traceId, spanId };
}

/**
 * Validates incoming request ID or generates a compliant RFC 4122 UUIDv4.
 */
export function resolveRequestId(incoming?: string | null): string {
  if (incoming && typeof incoming === 'string') {
    const trimmed = incoming.trim();
    if (SAFE_REQUEST_ID_REGEX.test(trimmed)) {
      return trimmed;
    }
  }
  return crypto.randomUUID();
}

/**
 * Generates a random 32-hex lowercase W3C compliant trace ID.
 */
export function generateTraceId(): string {
  return crypto.randomBytes(16).toString('hex').toLowerCase();
}

/**
 * Generates a random 16-hex lowercase W3C compliant span ID.
 */
export function generateSpanId(): string {
  return crypto.randomBytes(8).toString('hex').toLowerCase();
}
