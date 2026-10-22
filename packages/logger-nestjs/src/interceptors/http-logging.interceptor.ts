import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Inject,
  Optional,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import type { LogLevel } from '@skyra/logger-core';
import type { SkyraLogger } from '@skyra/logger-node';
import type { SkyraLoggerOptions } from '../skyra-logger.options.js';
import { RequestContextService } from '../context/request-context.service.js';
import {
  SKYRA_LOGGER_OPTIONS,
  SKYRA_LOGGER_INSTANCE,
  HTTP_LOGGED_SYMBOL,
  DEFAULT_EXCLUDED_PATHS,
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
  writableEnded?: boolean;
  once(event: string, listener: (...args: unknown[]) => void): this;
  [key: string]: unknown;
  [HTTP_LOGGED_SYMBOL]?: boolean;
}

/**
 * SkyraHttpLoggingInterceptor automatically measures and logs HTTP request execution duration,
 * status codes, sanitized route templates, and outcome adhering to the Skyra Logging Standard v1.0.
 */
@Injectable()
export class SkyraHttpLoggingInterceptor implements NestInterceptor {
  private readonly excludedPaths: readonly string[];
  private readonly sampleRate: number;
  private readonly isHttpLoggingEnabled: boolean;

  constructor(
    @Inject(SKYRA_LOGGER_OPTIONS) private readonly options: SkyraLoggerOptions,
    @Inject(SKYRA_LOGGER_INSTANCE) private readonly logger: SkyraLogger,
    @Optional() private readonly requestContextService?: RequestContextService
  ) {
    this.isHttpLoggingEnabled = options.http?.enabled !== false;
    this.excludedPaths = options.http?.excludePaths ?? DEFAULT_EXCLUDED_PATHS;
    this.sampleRate = options.http?.sampleRate ?? 1.0;
  }

  public intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (!this.isHttpLoggingEnabled || context.getType() !== 'http') {
      return next.handle();
    }

    const httpContext = context.switchToHttp();
    const req = httpContext.getRequest<ExpressRequest>();
    const res = httpContext.getResponse<ExpressResponse>();

    if (!req || !res) {
      return next.handle();
    }

    // 1. Check path exclusion
    const rawPath = req.originalUrl || req.url || req.path || '/';
    if (this.isPathExcluded(rawPath)) {
      return next.handle();
    }

    const startNs = process.hrtime.bigint();
    const requestId = this.requestContextService?.getRequestId() || 'unknown';
    const traceId = this.requestContextService?.getTraceId();
    const spanId = this.requestContextService?.getSpanId();

    // 2. Optional request arrival logging
    if (this.options.http?.logRequests) {
      this.logger.debug(`HTTP request received: ${req.method} ${rawPath}`, {
        action: 'http.request.received',
        category: ['web'],
        http: {
          request: {
            method: req.method?.toUpperCase(),
            id: requestId,
          },
        },
        ...(traceId ? { traceId } : {}),
        ...(spanId ? { spanId } : {}),
      });
    }

    // 3. Setup response completion logging on 'finish'
    const logCompletion = (caughtError?: unknown) => {
      if (res[HTTP_LOGGED_SYMBOL]) {
        return; // Deduplication: already logged by exception filter or previous trigger
      }
      res[HTTP_LOGGED_SYMBOL] = true;

      const elapsedNs = Number(process.hrtime.bigint() - startNs);
      const elapsedMs = Number((elapsedNs / 1_000_000).toFixed(3));

      // Resolve final status code
      let statusCode = res.statusCode || 200;
      let sanitizedErr = caughtError ? sanitizeError(caughtError) : undefined;
      if (caughtError) {
        statusCode = sanitizedErr?.httpStatus ?? (res.statusCode >= 400 ? res.statusCode : 500);
      }

      // Sampling check: errors (status >= 400) are NEVER dropped by sampling
      if (statusCode < 400 && this.sampleRate < 1.0) {
        if (Math.random() >= this.sampleRate) {
          return;
        }
      }

      // Determine severity
      let level: LogLevel = 'info';
      if (statusCode >= 500) {
        level = 'error';
      } else if (statusCode >= 400) {
        level = 'warn';
      }

      // Resolve sanitized route template
      const frameworkRoute = req.route?.path
        ? (req.baseUrl || '') + req.route.path
        : undefined;
      const routeTemplate = sanitizeRouteTemplate(rawPath, frameworkRoute);

      const eventContext = buildHttpCompletedEventContext({
        method: req.method || 'GET',
        statusCode,
        durationMs: elapsedMs,
        durationNs: elapsedNs,
        routeTemplate,
        requestId,
        traceId,
        spanId,
        error: sanitizedErr,
        customContext: this.requestContextService?.getContext(),
      });

      const message = `${req.method?.toUpperCase()} ${routeTemplate} ${statusCode} - ${elapsedMs}ms`;
      this.logger.log(level, message, eventContext);
    };

    // Attach finish listener to capture final status code when Express finishes
    if (typeof res.once === 'function') {
      res.once('finish', () => logCompletion());
      res.once('close', () => {
        if (!res.writableEnded) {
          // Client disconnected prematurely
          logCompletion(new Error('Client closed request prematurely'));
        }
      });
    }

    return next.handle().pipe(
      catchError((err) => {
        // Log immediately on error in case stream doesn't emit finish
        logCompletion(err);
        throw err;
      })
    );
  }

  private isPathExcluded(urlPath: string): boolean {
    const cleanPath = urlPath.split('?')[0] || urlPath;
    for (const pattern of this.excludedPaths) {
      if (cleanPath === pattern || cleanPath.startsWith(`${pattern}/`)) {
        return true;
      }
    }
    return false;
  }
}
