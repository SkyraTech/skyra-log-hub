import type { LogContext } from '@skyra/logger-node';
import type { SkyraNextLogger } from './logger.js';
import { createNextSkyraLogger, getSkyraServerLogger } from './logger.js';
import type { NextSkyraLoggerOptions } from './config.js';
import { isEdgeRuntime } from './internal/runtime.js';
import { sanitizeError } from './internal/error-sanitizer.js';
import { sanitizeRouteTemplate } from './internal/route-sanitizer.js';
import { extractTraceparent, resolveRequestId } from './internal/correlation.js';

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

export type NextRequestErrorHandler = (
  err: unknown,
  request: NextRequestErrorInfo,
  context?: NextErrorContextInfo
) => void | Promise<void>;

// Deduplication cache to prevent duplicate error events
const SEEN_ERRORS = new WeakSet<object>();

/**
 * Initializes the Skyra logging instrumentation for Next.js applications during the
 * official Next.js `register()` lifecycle hook in `instrumentation.ts`.
 *
 * @param options Optional logger configuration. If omitted, uses environment variables.
 */
export async function registerSkyraInstrumentation(
  options?: NextSkyraLoggerOptions
): Promise<SkyraNextLogger> {
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
export function createSkyraRequestErrorHandler(
  logger?: SkyraNextLogger
): NextRequestErrorHandler {
  return (err: unknown, request: NextRequestErrorInfo, context?: NextErrorContextInfo): void => {
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
    let incomingTraceparent: string | undefined;
    let incomingRequestId: string | undefined;

    if (request?.headers) {
      if (typeof (request.headers as Headers).get === 'function') {
        const h = request.headers as Headers;
        incomingTraceparent = h.get('traceparent') || undefined;
        incomingRequestId = h.get('x-request-id') || h.get('request-id') || undefined;
      } else {
        const h = request.headers as Record<string, string | string[] | undefined>;
        const tp = h['traceparent'];
        incomingTraceparent = Array.isArray(tp) ? tp[0] : tp;
        const rid = h['x-request-id'] || h['request-id'];
        incomingRequestId = Array.isArray(rid) ? rid[0] : rid;
      }
    }

    const trace = extractTraceparent(incomingTraceparent);
    const requestId = resolveRequestId(incomingRequestId);

    const logContext: LogContext = {
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

    activeLogger.error(
      `Next.js Request Error: ${method} ${routeTemplate} [${sanitized.type}: ${sanitized.message}]`,
      logContext
    );
  };
}
