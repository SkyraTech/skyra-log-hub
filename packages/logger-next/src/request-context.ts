import { AsyncLocalStorage } from 'node:async_hooks';
import { isEdgeRuntime } from './internal/runtime.js';

export interface NextRequestContextStore {
  requestId: string;
  traceId?: string;
  spanId?: string;
  startTimeNs?: bigint;
  customContext?: Record<string, unknown>;
}

// Global symbol to ensure store persists across HMR in development
const ASYNC_STORE_KEY = Symbol.for('skyra.logger.next.request_context_store');

interface GlobalWithStore {
  [ASYNC_STORE_KEY]?: AsyncLocalStorage<NextRequestContextStore>;
}

const globalScope = globalThis as unknown as GlobalWithStore;

if (!globalScope[ASYNC_STORE_KEY] && !isEdgeRuntime()) {
  globalScope[ASYNC_STORE_KEY] = new AsyncLocalStorage<NextRequestContextStore>();
}

/**
 * Runs an asynchronous function within an isolated request context scope.
 */
export function runWithRequestContext<T>(
  store: NextRequestContextStore,
  fn: () => T | Promise<T>
): Promise<T> | T {
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
export function getNextRequestContext(): NextRequestContextStore | undefined {
  const asyncStorage = globalScope[ASYNC_STORE_KEY];
  if (!asyncStorage || isEdgeRuntime()) {
    return undefined;
  }
  return asyncStorage.getStore();
}

/**
 * Retrieves the current request ID from active context, or returns fallback.
 */
export function getActiveRequestId(fallback = 'unknown'): string {
  return getNextRequestContext()?.requestId ?? fallback;
}

/**
 * Retrieves the current trace ID from active context.
 */
export function getActiveTraceId(): string | undefined {
  return getNextRequestContext()?.traceId;
}

/**
 * Retrieves the current span ID from active context.
 */
export function getActiveSpanId(): string | undefined {
  return getNextRequestContext()?.spanId;
}

/**
 * Returns the elapsed milliseconds since request start if startTimeNs is recorded in context.
 */
export function getActiveElapsedMs(): number {
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
export function setRequestContextValue(key: string, value: unknown): void {
  const store = getNextRequestContext();
  if (store) {
    if (!store.customContext) {
      store.customContext = {};
    }
    store.customContext[key] = value;
  }
}
