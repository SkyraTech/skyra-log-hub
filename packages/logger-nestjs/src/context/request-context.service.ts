import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Isolated context state propagated across asynchronous call chains for a single request.
 */
export interface RequestStore {
  /** Canonical request identifier */
  requestId: string;
  /** W3C 32-hex trace identifier */
  traceId?: string;
  /** W3C 16-hex span identifier */
  spanId?: string;
  /** Monotonic process hrtime timestamp in nanoseconds when request processing began */
  startTimeNs: bigint;
  /** User-defined contextual key-value pairs associated with the active request */
  customContext: Record<string, unknown>;
}

/**
 * RequestContextService uses Node.js AsyncLocalStorage to safely propagate
 * request correlation identifiers (requestId, W3C traceId, spanId) and custom
 * execution context down the asynchronous call stack without cross-request leakage.
 */
@Injectable()
export class RequestContextService {
  private readonly asyncLocalStorage = new AsyncLocalStorage<RequestStore>();

  /**
   * Executes a callback within the scope of the given RequestStore.
   */
  public run<T>(store: RequestStore, callback: () => T): T {
    return this.asyncLocalStorage.run(store, callback);
  }

  /**
   * Returns the current RequestStore, or undefined if called outside an active request scope.
   */
  public getStore(): RequestStore | undefined {
    return this.asyncLocalStorage.getStore();
  }

  /**
   * Returns the active request ID if within a request context, or undefined.
   */
  public getRequestId(): string | undefined {
    return this.asyncLocalStorage.getStore()?.requestId;
  }

  /**
   * Returns the active W3C trace ID if within a request context, or undefined.
   */
  public getTraceId(): string | undefined {
    return this.asyncLocalStorage.getStore()?.traceId;
  }

  /**
   * Returns the active W3C span ID if within a request context, or undefined.
   */
  public getSpanId(): string | undefined {
    return this.asyncLocalStorage.getStore()?.spanId;
  }

  /**
   * Attaches a key-value attribute to the active request context.
   * Silently ignored if invoked outside an active request scope.
   */
  public set(key: string, value: unknown): void {
    const store = this.asyncLocalStorage.getStore();
    if (store) {
      store.customContext[key] = value;
    }
  }

  /**
   * Retrieves a custom key-value attribute from the active request context.
   */
  public get(key: string): unknown {
    return this.asyncLocalStorage.getStore()?.customContext[key];
  }

  /**
   * Returns a copy of all custom context key-value pairs for the active request.
   */
  public getContext(): Record<string, unknown> {
    const store = this.asyncLocalStorage.getStore();
    return store ? { ...store.customContext } : {};
  }

  /**
   * Calculates the elapsed time in milliseconds since the start of the active request
   * using high-precision monotonic clock.
   */
  public getElapsedMs(): number | undefined {
    const store = this.asyncLocalStorage.getStore();
    if (!store) return undefined;
    const elapsedNs = Number(process.hrtime.bigint() - store.startTimeNs);
    return Number((elapsedNs / 1_000_000).toFixed(3));
  }
}
