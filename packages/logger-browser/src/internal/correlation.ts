/**
 * @skyra/logger-browser - W3C Trace Context and Origin Correlation Engine
 */

const TRACE_ID_HEX_REGEX = /^[0-9a-fA-F]{32}$/;
const SPAN_ID_HEX_REGEX = /^[0-9a-fA-F]{16}$/;
const ALL_ZERO_TRACE_ID = '00000000000000000000000000000000';
const ALL_ZERO_SPAN_ID = '0000000000000000';

export function isValidTraceId(traceId: unknown): traceId is string {
  if (typeof traceId !== 'string') return false;
  return TRACE_ID_HEX_REGEX.test(traceId) && traceId !== ALL_ZERO_TRACE_ID;
}

export function isValidSpanId(spanId: unknown): spanId is string {
  if (typeof spanId !== 'string') return false;
  return SPAN_ID_HEX_REGEX.test(spanId) && spanId !== ALL_ZERO_SPAN_ID;
}

export function generateTraceparent(
  traceId: string,
  spanId: string,
  sampled = true
): string {
  if (!isValidTraceId(traceId)) {
    throw new Error(`Invalid W3C trace_id: "${traceId}". Must be 32 non-zero hex digits.`);
  }
  if (!isValidSpanId(spanId)) {
    throw new Error(`Invalid W3C span_id: "${spanId}". Must be 16 non-zero hex digits.`);
  }
  const flags = sampled ? '01' : '00';
  return `00-${traceId.toLowerCase()}-${spanId.toLowerCase()}-${flags}`;
}

export function parseTraceparent(
  header: string
): { traceId: string; spanId: string; sampled: boolean } | undefined {
  if (!header || typeof header !== 'string') return undefined;
  const parts = header.trim().split('-');
  if (parts.length < 4) return undefined;
  const [version, traceId, spanId, flags] = parts;
  if (version !== '00' || !traceId || !spanId || !flags) return undefined;
  if (!isValidTraceId(traceId) || !isValidSpanId(spanId)) return undefined;
  const sampled = (parseInt(flags, 16) & 0x01) === 0x01;
  return { traceId: traceId.toLowerCase(), spanId: spanId.toLowerCase(), sampled };
}

/**
 * Validates whether an outgoing destination URL is allowed for tracing header injection.
 */
export function isAllowedOrigin(
  targetUrl: string,
  allowedOrigins?: readonly string[]
): boolean {
  if (!allowedOrigins || allowedOrigins.length === 0) {
    return false;
  }

  try {
    const parsed = new URL(targetUrl, typeof window !== 'undefined' ? window.location.href : 'http://localhost');
    const targetOrigin = parsed.origin.toLowerCase();

    for (const allowed of allowedOrigins) {
      if (allowed === '*' || allowed.toLowerCase() === targetOrigin) {
        return true;
      }
    }
  } catch {
    return false;
  }

  return false;
}
