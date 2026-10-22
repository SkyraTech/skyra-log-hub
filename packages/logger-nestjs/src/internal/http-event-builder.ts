import type { LogContext } from '@skyra/logger-node';
import type { SanitizedErrorInfo } from './error-sanitizer.js';

export interface HttpCompletedEventParams {
  method: string;
  statusCode: number;
  durationMs: number;
  durationNs: number;
  routeTemplate: string;
  requestId: string;
  traceId?: string;
  spanId?: string;
  error?: SanitizedErrorInfo;
  customContext?: Record<string, unknown>;
}

/**
 * Builds canonical structured metadata for an `http.request.completed` event adhering to ECS 8.11.0.
 */
export function buildHttpCompletedEventContext(params: HttpCompletedEventParams): LogContext {
  const {
    method,
    statusCode,
    durationMs,
    durationNs,
    routeTemplate,
    requestId,
    traceId,
    spanId,
    error,
    customContext,
  } = params;

  // Outcome: status < 400 is 'success', >= 400 is 'failure'
  const outcome: 'success' | 'failure' = statusCode < 400 ? 'success' : 'failure';

  const context: LogContext = {
    action: 'http.request.completed',
    outcome,
    category: ['web'],
    durationMs,
    durationNs,
    http: {
      request: {
        method: method.toUpperCase(),
        id: requestId,
      },
      response: {
        status_code: statusCode,
      },
      route: routeTemplate,
    },
    skyra: {
      http: {
        route_template: routeTemplate,
      },
    },
  };

  if (traceId) {
    context.traceId = traceId;
  }
  if (spanId) {
    context.spanId = spanId;
  }

  if (error) {
    context.error = {
      type: error.type,
      message: error.message,
      ...(error.code !== undefined ? { code: error.code } : {}),
      ...(error.stack_trace ? { stack_trace: error.stack_trace } : {}),
    };
  }

  if (customContext && Object.keys(customContext).length > 0) {
    Object.assign(context, customContext);
  }

  return context;
}
