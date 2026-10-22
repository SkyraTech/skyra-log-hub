import type { LogLevel } from '@skyra/logger-core';
import type { LogContext } from '@skyra/logger-node';
import type { SkyraNextLogger } from './logger.js';
import { getSkyraServerLogger } from './logger.js';
import { extractTraceparent, resolveRequestId, generateTraceId, generateSpanId } from './internal/correlation.js';
import { sanitizeRouteTemplate } from './internal/route-sanitizer.js';
import { sanitizeError } from './internal/error-sanitizer.js';
import { runWithRequestContext } from './request-context.js';
import { DEFAULT_NEXT_EXCLUDED_PATHS } from './config.js';

export const HTTP_LOGGED_SYMBOL = Symbol.for('skyra.http.logged');

export interface RouteHandlerOptions {
  /** Explicit parameterized route template (e.g. '/api/users/[userId]') */
  route?: string;
  /** Optional custom logger instance (defaults to global server logger) */
  logger?: SkyraNextLogger;
}

export type RouteHandlerFn<TArgs extends [Request, ...any[]] = [Request, ...any[]]> = (
  ...args: TArgs
) => Promise<Response> | Response;

/**
 * Higher-order function that wraps Next.js App Router Route Handlers with automatic
 * structured logging, monotonic timing, distributed tracing, and request correlation.
 *
 * Preserves streaming response semantics and never buffers or consumes request/response bodies.
 */
export function withSkyraLogging<TArgs extends [Request, ...any[]]>(
  handler: (...args: TArgs) => Promise<Response> | Response,
  options?: RouteHandlerOptions
): (...args: TArgs) => Promise<Response> {
  return async (...args: TArgs): Promise<Response> => {
    const request = args[0];
    const logger = options?.logger ?? getSkyraServerLogger();
    const config = logger.getOptions();
    const isHttpEnabled = config.http?.enabled !== false;

    if (!isHttpEnabled) {
      return handler(...args);
    }

    // Check path exclusion
    let urlPath = '/';
    try {
      const parsedUrl = new URL(request.url);
      urlPath = parsedUrl.pathname;
    } catch {
      urlPath = request.url || '/';
    }

    const excludedPaths = config.http?.excludePaths ?? DEFAULT_NEXT_EXCLUDED_PATHS;
    if (isPathExcluded(urlPath, excludedPaths)) {
      return handler(...args);
    }

    // Resolve correlation identifiers
    const incomingTrace = extractTraceparent(request.headers.get('traceparent'));
    const traceId = incomingTrace?.traceId ?? generateTraceId();
    const spanId = incomingTrace?.spanId ?? generateSpanId();
    const requestId = resolveRequestId(
      request.headers.get('x-request-id') || request.headers.get('request-id')
    );

    const startNs = process.hrtime.bigint();
    const method = request.method ? request.method.toUpperCase() : 'GET';
    const sampleRate = config.http?.sampleRate ?? 1.0;

    // Optional request arrival log
    if (config.http?.logRequests) {
      logger.debug(`HTTP request received: ${method} ${urlPath}`, {
        action: 'http.request.received',
        category: ['web'],
        http: {
          request: {
            method,
            id: requestId,
          },
        },
        traceId,
        spanId,
      });
    }

    const routeTemplate = sanitizeRouteTemplate(urlPath, options?.route);

    return runWithRequestContext(
      {
        requestId,
        traceId,
        spanId,
        startTimeNs: startNs,
      },
      async () => {
        let response: Response;
        try {
          response = await handler(...args);
        } catch (error) {
          const elapsedNs = Number(process.hrtime.bigint() - startNs);
          const elapsedMs = Number((elapsedNs / 1_000_000).toFixed(3));
          const sanitizedErr = sanitizeError(error);
          const statusCode = sanitizedErr.httpStatus ?? 500;

          emitHttpCompletedLog({
            logger,
            request,
            method,
            statusCode,
            routeTemplate,
            elapsedMs,
            elapsedNs,
            requestId,
            traceId,
            spanId,
            error: sanitizedErr,
          });

          throw error;
        }

        const elapsedNs = Number(process.hrtime.bigint() - startNs);
        const elapsedMs = Number((elapsedNs / 1_000_000).toFixed(3));
        const statusCode = response.status || 200;

        // Sampling check: errors (status >= 400) are NEVER dropped by sampling
        let shouldLog = true;
        if (statusCode < 400 && sampleRate < 1.0) {
          shouldLog = Math.random() < sampleRate;
        }

        if (shouldLog) {
          emitHttpCompletedLog({
            logger,
            request,
            method,
            statusCode,
            routeTemplate,
            elapsedMs,
            elapsedNs,
            requestId,
            traceId,
            spanId,
          });
        }

        // Attach x-request-id to outgoing response headers if headers are mutable
        try {
          if (!response.headers.has('x-request-id')) {
            response.headers.set('x-request-id', requestId);
          }
        } catch {
          // Headers may be immutable on certain Response implementations; safe no-op
        }

        return response;
      }
    );
  };
}

interface EmitParams {
  logger: SkyraNextLogger;
  request: Request;
  method: string;
  statusCode: number;
  routeTemplate: string;
  elapsedMs: number;
  elapsedNs: number;
  requestId: string;
  traceId: string;
  spanId: string;
  error?: { type: string; message: string; code?: string | number; stack_trace?: string };
}

function emitHttpCompletedLog(params: EmitParams): void {
  const reqObj = params.request as unknown as Record<symbol, boolean>;
  if (reqObj[HTTP_LOGGED_SYMBOL]) {
    return; // Exactly-once deduplication
  }
  reqObj[HTTP_LOGGED_SYMBOL] = true;

  const outcome: 'success' | 'failure' = params.statusCode < 400 ? 'success' : 'failure';
  let level: LogLevel = 'info';
  if (params.statusCode >= 500) {
    level = 'error';
  } else if (params.statusCode >= 400) {
    level = 'warn';
  }

  const context: LogContext = {
    action: 'http.request.completed',
    outcome,
    category: ['web'],
    durationMs: params.elapsedMs,
    durationNs: params.elapsedNs,
    traceId: params.traceId,
    spanId: params.spanId,
    http: {
      request: {
        method: params.method,
        id: params.requestId,
      },
      response: {
        status_code: params.statusCode,
      },
      route: params.routeTemplate,
    },
    skyra: {
      http: {
        route_template: params.routeTemplate,
      },
    },
  };

  if (params.error) {
    context.error = params.error;
  }

  const message = `${params.method} ${params.routeTemplate} ${params.statusCode} - ${params.elapsedMs}ms`;
  params.logger.log(level, message, context);
}

function isPathExcluded(path: string, excluded: readonly string[]): boolean {
  const cleanPath = path.split('?')[0] || path;
  for (const pattern of excluded) {
    if (cleanPath === pattern || cleanPath.startsWith(`${pattern}/`)) {
      return true;
    }
  }
  return false;
}
