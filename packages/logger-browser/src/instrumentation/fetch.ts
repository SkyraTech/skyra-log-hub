/**
 * @skyra/logger-browser - Explicit Fetch Instrumentation Wrapper
 * Measures HTTP requests without reading bodies or credentials.
 */

import type { SkyraBrowserLogger } from '../logger.js';
import { sanitizeRoute } from '../capture/navigation.js';

export async function instrumentFetch(
  logger: SkyraBrowserLogger,
  input: RequestInfo | URL,
  init?: RequestInit,
  customFetch?: typeof fetch
): Promise<Response> {
  const fetchFn = customFetch ?? (typeof fetch !== 'undefined' ? fetch : undefined);
  if (!fetchFn) {
    throw new Error('global fetch is unavailable.');
  }

  const method = (init?.method || (typeof input === 'object' && 'method' in input ? input.method : 'GET')).toUpperCase();
  const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

  // Extract clean path
  let path = '/';
  try {
    const parsed = new URL(urlStr, typeof window !== 'undefined' ? window.location.href : 'http://localhost');
    path = sanitizeRoute(parsed.pathname);
  } catch {
    path = sanitizeRoute(urlStr);
  }

  const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();

  try {
    const response = await fetchFn(input, init);
    const endTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const durationMs = Math.max(0, endTime - startTime);
    const durationNs = Math.round(durationMs * 1_000_000);

    const outcome = response.ok ? 'success' : 'failure';
    const level = response.ok ? 'info' : response.status >= 500 ? 'error' : 'warn';

    logger.log(level, `HTTP ${method} ${path} -> ${response.status}`, {
      action: 'http.request.completed',
      outcome,
      durationNs,
      durationMs,
      route: path,
      http: {
        request: { method },
        response: { status_code: response.status },
        route: path,
      },
    });

    return response;
  } catch (err) {
    const endTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const durationMs = Math.max(0, endTime - startTime);
    const durationNs = Math.round(durationMs * 1_000_000);

    logger.error(`HTTP ${method} ${path} failed`, {
      action: 'http.request.failed',
      outcome: 'failure',
      durationNs,
      durationMs,
      route: path,
      error: err,
    });

    throw err;
  }
}
