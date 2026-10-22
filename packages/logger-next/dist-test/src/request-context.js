import { AsyncLocalStorage } from 'node:async_hooks';
import { isEdgeRuntime } from './internal/runtime.js';
// Global symbol to ensure store persists across HMR in development
const ASYNC_STORE_KEY = Symbol.for('skyra.logger.next.request_context_store');
const globalScope = globalThis;
if (!globalScope[ASYNC_STORE_KEY] && !isEdgeRuntime()) {
    globalScope[ASYNC_STORE_KEY] = new AsyncLocalStorage();
}
/**
 * Runs an asynchronous function within an isolated request context scope.
 */
export function runWithRequestContext(store, fn) {
    const asyncStorage = globalScope[ASYNC_STORE_KEY];
    if (!asyncStorage || isEdgeRuntime()) {
        // Edge runtime or unsupported async context fallback
        return fn();
    }
    return asyncStorage.run(store, fn);
}
/**
 * Retrieves the active request context store if called within an active request scope.
 */
export function getNextRequestContext() {
    const asyncStorage = globalScope[ASYNC_STORE_KEY];
    if (!asyncStorage || isEdgeRuntime()) {
        return undefined;
    }
    return asyncStorage.getStore();
}
/**
 * Retrieves the current request ID from active context, or returns fallback.
 */
export function getActiveRequestId(fallback = 'unknown') {
    return getNextRequestContext()?.requestId ?? fallback;
}
/**
 * Retrieves the current trace ID from active context.
 */
export function getActiveTraceId() {
    return getNextRequestContext()?.traceId;
}
/**
 * Retrieves the current span ID from active context.
 */
export function getActiveSpanId() {
    return getNextRequestContext()?.spanId;
}
/**
 * Returns the elapsed milliseconds since request start if startTimeNs is recorded in context.
 */
export function getActiveElapsedMs() {
    const store = getNextRequestContext();
    if (!store?.startTimeNs) {
        return 0;
    }
    const elapsedNs = Number(process.hrtime.bigint() - store.startTimeNs);
    return Number((elapsedNs / 1_000_000).toFixed(3));
}
/**
 * Sets a key-value pair on the current request custom context.
 */
export function setRequestContextValue(key, value) {
    const store = getNextRequestContext();
    if (store) {
        if (!store.customContext) {
            store.customContext = {};
        }
        store.customContext[key] = value;
    }
}
//# sourceMappingURL=request-context.js.map