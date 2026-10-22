export interface NextRequestContextStore {
    requestId: string;
    traceId?: string;
    spanId?: string;
    startTimeNs?: bigint;
    customContext?: Record<string, unknown>;
}
/**
 * Runs an asynchronous function within an isolated request context scope.
 */
export declare function runWithRequestContext<T>(store: NextRequestContextStore, fn: () => T | Promise<T>): Promise<T> | T;
/**
 * Retrieves the active request context store if called within an active request scope.
 */
export declare function getNextRequestContext(): NextRequestContextStore | undefined;
/**
 * Retrieves the current request ID from active context, or returns fallback.
 */
export declare function getActiveRequestId(fallback?: string): string;
/**
 * Retrieves the current trace ID from active context.
 */
export declare function getActiveTraceId(): string | undefined;
/**
 * Retrieves the current span ID from active context.
 */
export declare function getActiveSpanId(): string | undefined;
/**
 * Returns the elapsed milliseconds since request start if startTimeNs is recorded in context.
 */
export declare function getActiveElapsedMs(): number;
/**
 * Sets a key-value pair on the current request custom context.
 */
export declare function setRequestContextValue(key: string, value: unknown): void;
//# sourceMappingURL=request-context.d.ts.map