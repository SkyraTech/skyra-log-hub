import { createNextSkyraLogger, getSkyraServerLogger } from './logger.js';
import { isEdgeRuntime } from './internal/runtime.js';
import { sanitizeError } from './internal/error-sanitizer.js';
import { sanitizeRouteTemplate } from './internal/route-sanitizer.js';
import { extractTraceparent, resolveRequestId } from './internal/correlation.js';
// Deduplication cache to prevent duplicate error events
const SEEN_ERRORS = new WeakSet();
/**
 * Initializes the Skyra logging instrumentation for Next.js applications during the
 * official Next.js `register()` lifecycle hook in `instrumentation.ts`.
 *
 * @param options Optional logger configuration. If omitted, uses environment variables.
 */
export async function registerSkyraInstrumentation(options) {
    if (isEdgeRuntime()) {
        return getSkyraServerLogger();
    }
    if (options) {
        return createNextSkyraLogger(options);
    }
    return getSkyraServerLogger();
}
/**
 * Creates an error handler callback compatible with Next.js 15+ `onRequestError` in `instrumentation.ts`.
 * Safely sanitizes error details, captures framework route templates, and deduplicates events.
 */
export function createSkyraRequestErrorHandler(logger) {
    return (err, request, context) => {
        const activeLogger = logger ?? getSkyraServerLogger();
        // Deduplication check: skip if this error object was already logged
        if (err && typeof err === 'object') {
            if (SEEN_ERRORS.has(err)) {
                return;
            }
            SEEN_ERRORS.add(err);
        }
        const sanitized = sanitizeError(err);
        const method = request?.method ? request.method.toUpperCase() : 'UNKNOWN';
        const rawPath = request?.path || '/';
        const routeTemplate = sanitizeRouteTemplate(rawPath, context?.routePath);
        // Extract headers safely without retaining secret authorization/cookie headers
        let incomingTraceparent;
        let incomingRequestId;
        if (request?.headers) {
            if (typeof request.headers.get === 'function') {
                const h = request.headers;
                incomingTraceparent = h.get('traceparent') || undefined;
                incomingRequestId = h.get('x-request-id') || h.get('request-id') || undefined;
            }
            else {
                const h = request.headers;
                const tp = h['traceparent'];
                incomingTraceparent = Array.isArray(tp) ? tp[0] : tp;
                const rid = h['x-request-id'] || h['request-id'];
                incomingRequestId = Array.isArray(rid) ? rid[0] : rid;
            }
        }
        const trace = extractTraceparent(incomingTraceparent);
        const requestId = resolveRequestId(incomingRequestId);
        const logContext = {
            action: 'framework.request.error',
            outcome: 'failure',
            category: ['web'],
            traceId: trace?.traceId,
            spanId: trace?.spanId,
            http: {
                request: {
                    method,
                    id: requestId,
                },
                response: {
                    status_code: sanitized.httpStatus ?? 500,
                },
                route: routeTemplate,
            },
            skyra: {
                http: {
                    route_template: routeTemplate,
                },
            },
            error: {
                type: sanitized.type,
                message: sanitized.message,
                ...(sanitized.code !== undefined ? { code: sanitized.code } : {}),
                ...(sanitized.stack_trace ? { stack_trace: sanitized.stack_trace } : {}),
            },
        };
        if (context?.routerKind || context?.routeType) {
            logContext['framework'] = {
                name: 'nextjs',
                ...(context.routerKind ? { router_kind: context.routerKind } : {}),
                ...(context.routeType ? { route_type: context.routeType } : {}),
            };
        }
        activeLogger.error(`Next.js Request Error: ${method} ${routeTemplate} [${sanitized.type}: ${sanitized.message}]`, logContext);
    };
}
//# sourceMappingURL=instrumentation.js.map