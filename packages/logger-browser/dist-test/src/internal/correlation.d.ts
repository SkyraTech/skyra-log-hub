/**
 * @skyra/logger-browser - W3C Trace Context and Origin Correlation Engine
 */
export declare function isValidTraceId(traceId: unknown): traceId is string;
export declare function isValidSpanId(spanId: unknown): spanId is string;
export declare function generateTraceparent(traceId: string, spanId: string, sampled?: boolean): string;
export declare function parseTraceparent(header: string): {
    traceId: string;
    spanId: string;
    sampled: boolean;
} | undefined;
/**
 * Validates whether an outgoing destination URL is allowed for tracing header injection.
 */
export declare function isAllowedOrigin(targetUrl: string, allowedOrigins?: readonly string[]): boolean;
//# sourceMappingURL=correlation.d.ts.map