import type { SkyraNextLogger } from './logger.js';
export declare const HTTP_LOGGED_SYMBOL: unique symbol;
export interface RouteHandlerOptions {
    /** Explicit parameterized route template (e.g. '/api/users/[userId]') */
    route?: string;
    /** Optional custom logger instance (defaults to global server logger) */
    logger?: SkyraNextLogger;
}
export type RouteHandlerFn<TArgs extends [Request, ...any[]] = [Request, ...any[]]> = (...args: TArgs) => Promise<Response> | Response;
/**
 * Higher-order function that wraps Next.js App Router Route Handlers with automatic
 * structured logging, monotonic timing, distributed tracing, and request correlation.
 *
 * Preserves streaming response semantics and never buffers or consumes request/response bodies.
 */
export declare function withSkyraLogging<TArgs extends [Request, ...any[]]>(handler: (...args: TArgs) => Promise<Response> | Response, options?: RouteHandlerOptions): (...args: TArgs) => Promise<Response>;
//# sourceMappingURL=route-handler.d.ts.map