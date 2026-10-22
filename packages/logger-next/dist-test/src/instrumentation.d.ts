import type { SkyraNextLogger } from './logger.js';
import type { NextSkyraLoggerOptions } from './config.js';
export interface NextRequestErrorInfo {
    path: string;
    method: string;
    headers?: Record<string, string | string[] | undefined> | Headers;
}
export interface NextErrorContextInfo {
    routerKind?: 'Pages Router' | 'App Router' | string;
    routePath?: string;
    routeType?: 'render' | 'route' | 'action' | 'middleware' | string;
    revalidateReason?: string;
}
export type NextRequestErrorHandler = (err: unknown, request: NextRequestErrorInfo, context?: NextErrorContextInfo) => void | Promise<void>;
/**
 * Initializes the Skyra logging instrumentation for Next.js applications during the
 * official Next.js `register()` lifecycle hook in `instrumentation.ts`.
 *
 * @param options Optional logger configuration. If omitted, uses environment variables.
 */
export declare function registerSkyraInstrumentation(options?: NextSkyraLoggerOptions): Promise<SkyraNextLogger>;
/**
 * Creates an error handler callback compatible with Next.js 15+ `onRequestError` in `instrumentation.ts`.
 * Safely sanitizes error details, captures framework route templates, and deduplicates events.
 */
export declare function createSkyraRequestErrorHandler(logger?: SkyraNextLogger): NextRequestErrorHandler;
//# sourceMappingURL=instrumentation.d.ts.map