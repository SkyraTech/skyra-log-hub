export declare const W3C_TRACEPARENT_REGEX: RegExp;
export declare const SAFE_REQUEST_ID_REGEX: RegExp;
export interface TraceContext {
    traceId: string;
    spanId: string;
}
/**
 * Extracts and strictly validates incoming W3C traceparent header adhering to W3C Trace Context spec.
 * Returns undefined if absent, malformed, forbidden version 'ff', or all-zero IDs.
 */
export declare function extractTraceparent(header?: string | null): TraceContext | undefined;
/**
 * Validates incoming request ID or generates a compliant RFC 4122 UUIDv4.
 */
export declare function resolveRequestId(incoming?: string | null): string;
/**
 * Generates a random 32-hex lowercase W3C compliant trace ID.
 */
export declare function generateTraceId(): string;
/**
 * Generates a random 16-hex lowercase W3C compliant span ID.
 */
export declare function generateSpanId(): string;
//# sourceMappingURL=correlation.d.ts.map