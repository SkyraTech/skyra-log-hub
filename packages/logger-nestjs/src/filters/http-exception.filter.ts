import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Inject,
  Optional,
} from '@nestjs/common';
import type { LogLevel } from '@skyra/logger-core';
import type { SkyraLogger } from '@skyra/logger-node';
import type { SkyraLoggerOptions } from '../skyra-logger.options.js';
import { RequestContextService } from '../context/request-context.service.js';
import {
  SKYRA_LOGGER_OPTIONS,
  SKYRA_LOGGER_INSTANCE,
  HTTP_LOGGED_SYMBOL,
} from '../constants.js';
import { sanitizeRouteTemplate } from '../internal/route-sanitizer.js';
import { sanitizeError } from '../internal/error-sanitizer.js';
import { buildHttpCompletedEventContext } from '../internal/http-event-builder.js';

interface ExpressRequest {
  method: string;
  url?: string;
  originalUrl?: string;
  path?: string;
  baseUrl?: string;
  route?: { path?: string };
  [key: string]: unknown;
}

interface ExpressResponse {
  statusCode: number;
  headersSent?: boolean;
  status(code: number): this;
  json(body: unknown): this;
  send(body: unknown): this;
  [key: string]: unknown;
  [HTTP_LOGGED_SYMBOL]?: boolean;
}

/**
 * Global exception filter capturing uncaught exceptions for Skyra LogHub
 * while preserving standard NestJS HTTP response semantics.
 */
@Catch()
export class SkyraHttpExceptionFilter implements ExceptionFilter {
  constructor(
    @Inject(SKYRA_LOGGER_OPTIONS) private readonly options: SkyraLoggerOptions,
    @Inject(SKYRA_LOGGER_INSTANCE) private readonly logger: SkyraLogger,
    @Optional() private readonly requestContextService?: RequestContextService
  ) {}

  public catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<ExpressRequest>();
    const res = ctx.getResponse<ExpressResponse>();

    // If not HTTP context or response headers already sent, pass through
    if (!res || typeof res.status !== 'function') {
      return;
    }

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let clientResponse: unknown = {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal Server Error',
    };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      clientResponse = exception.getResponse();
    }

    const sanitizedErr = sanitizeError(exception);
    sanitizedErr.httpStatus = status;

    // Deduplication check: if interceptor already logged this, avoid duplicate event
    if (!res[HTTP_LOGGED_SYMBOL]) {
      res[HTTP_LOGGED_SYMBOL] = true;

      const rawPath = req?.originalUrl || req?.url || req?.path || '/';
      const frameworkRoute = req?.route?.path
        ? (req.baseUrl || '') + req.route.path
        : undefined;
      const routeTemplate = sanitizeRouteTemplate(rawPath, frameworkRoute);

      const elapsedMs = this.requestContextService?.getElapsedMs() ?? 0;
      const elapsedNs = Math.round(elapsedMs * 1_000_000);
      const requestId = this.requestContextService?.getRequestId() || 'unknown';
      const traceId = this.requestContextService?.getTraceId();
      const spanId = this.requestContextService?.getSpanId();

      const level: LogLevel = status >= 500 ? 'error' : 'warn';

      const eventContext = buildHttpCompletedEventContext({
        method: req?.method || 'GET',
        statusCode: status,
        durationMs: elapsedMs,
        durationNs: elapsedNs,
        routeTemplate,
        requestId,
        traceId,
        spanId,
        error: sanitizedErr,
        customContext: this.requestContextService?.getContext(),
      });

      const message = `${req?.method?.toUpperCase() || 'GET'} ${routeTemplate} ${status} - ${elapsedMs}ms [${sanitizedErr.type}: ${sanitizedErr.message}]`;
      this.logger.log(level, message, eventContext);
    }

    // Preserve standard NestJS error response without exposing internal stack traces
    if (!res.headersSent) {
      res.status(status);
      if (typeof clientResponse === 'object' && clientResponse !== null) {
        res.json(clientResponse);
      } else {
        res.send(clientResponse);
      }
    }
  }
}
