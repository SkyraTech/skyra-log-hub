/**
 * @skyra/logger-angular - Angular HttpInterceptorFn
 * Opt-in HTTP request duration and status tracking without body consumption.
 */

import { inject } from '@angular/core';
import type { HttpRequest, HttpHandlerFn, HttpEvent, HttpResponse, HttpErrorResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { SkyraLoggerService } from './skyra-logger.service.js';

export function skyraHttpInterceptor(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
): Observable<HttpEvent<unknown>> {
  const logger = inject(SkyraLoggerService);
  const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();

  const method = req.method.toUpperCase();
  const rawUrl = req.url;

  // Extract clean route path
  let path = '/';
  try {
    const parsed = new URL(rawUrl, typeof window !== 'undefined' ? window.location.href : 'http://localhost');
    path = parsed.pathname;
  } catch {
    path = rawUrl.split('?')[0]!.split('#')[0]!;
  }

  return next(req).pipe(
    tap({
      next: (event) => {
        // Only log when response finishes
        if (event && (event as HttpResponse<unknown>).status !== undefined) {
          const resp = event as HttpResponse<unknown>;
          const endTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
          const durationMs = Math.max(0, endTime - startTime);
          const durationNs = Math.round(durationMs * 1_000_000);

          const outcome = resp.ok ? 'success' : 'failure';
          const level = resp.ok ? 'info' : resp.status >= 500 ? 'error' : 'warn';

          logger.log(level, `Angular HTTP ${method} ${path} -> ${resp.status}`, {
            action: 'angular.http.completed',
            outcome,
            durationNs,
            durationMs,
            route: path,
            http: {
              request: { method },
              response: { status_code: resp.status },
              route: path,
            },
          });
        }
      },
      error: (err: HttpErrorResponse | unknown) => {
        const endTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const durationMs = Math.max(0, endTime - startTime);
        const durationNs = Math.round(durationMs * 1_000_000);

        const status = (err as HttpErrorResponse)?.status ?? 0;
        logger.error(`Angular HTTP ${method} ${path} failed (${status})`, {
          action: 'angular.http.failed',
          outcome: 'failure',
          durationNs,
          durationMs,
          route: path,
          error: err instanceof Error ? err : new Error(String(err)),
          http: {
            request: { method },
            response: { status_code: status || 500 },
            route: path,
          },
        });
      },
    })
  );
}
