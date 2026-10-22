/**
 * @skyra/logger-browser - HTTP Transport
 * Delivers batched log events to an application-provided ingestion endpoint via fetch() or sendBeacon().
 */

import type { SkyraLogEvent } from '@skyra/logger-core/types';
import type { HttpTransportConfig } from '../types.js';
import type { BrowserTransport, BrowserTransportResult } from './transport.interface.js';
import { formatBrowserBatch } from '../formatter.js';
import { isAllowedOrigin } from '../internal/correlation.js';
import { emitBrowserDiagnostic } from '../internal/diagnostics.js';

export class HttpTransport implements BrowserTransport {
  public readonly name = 'http';
  private readonly _url: string;
  private readonly _headers: Record<string, string>;
  private readonly _credentials: 'omit' | 'same-origin' | 'include';
  private readonly _allowedOrigins?: readonly string[];
  private readonly _useBeaconOnUnload: boolean;

  constructor(options: HttpTransportConfig) {
    if (!options || typeof options.url !== 'string' || !options.url.trim()) {
      throw new Error('HttpTransport requires a non-empty "url" option.');
    }

    const trimmedUrl = options.url.trim();

    // Security check: HTTPS enforcement for non-localhost
    const isLocalhost =
      trimmedUrl.includes('localhost') ||
      trimmedUrl.includes('127.0.0.1') ||
      trimmedUrl.startsWith('/');

    if (options.rejectInsecureHttp !== false && !isLocalhost) {
      if (!trimmedUrl.startsWith('https://')) {
        throw new Error(
          `Insecure HTTP transport rejected: "${trimmedUrl}". Remote endpoints must use HTTPS.`
        );
      }
    }

    // Origin allowlist check
    if (options.allowedOrigins && options.allowedOrigins.length > 0) {
      if (!isAllowedOrigin(trimmedUrl, options.allowedOrigins)) {
        throw new Error(
          `Destination URL "${trimmedUrl}" is not in the allowedOrigins allowlist.`
        );
      }
    }

    this._url = trimmedUrl;
    this._headers = {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    };
    this._credentials = options.credentials ?? 'omit';
    this._allowedOrigins = options.allowedOrigins;
    this._useBeaconOnUnload = options.useBeaconOnUnload !== false;
  }

  public async send(
    batch: readonly SkyraLogEvent[]
  ): Promise<BrowserTransportResult> {
    if (batch.length === 0) {
      return {
        success: true,
        deliveredCount: 0,
        droppedCount: 0,
        retryable: false,
      };
    }

    const body = formatBrowserBatch(batch);

    try {
      if (typeof fetch === 'undefined') {
        emitBrowserDiagnostic('FetchUnavailable', 'global fetch() is unavailable in this environment.');
        return {
          success: false,
          deliveredCount: 0,
          droppedCount: batch.length,
          retryable: false,
          error: 'fetch unavailable',
        };
      }

      const response = await fetch(this._url, {
        method: 'POST',
        headers: this._headers,
        body,
        credentials: this._credentials,
        keepalive: true,
      });

      if (response.ok) {
        return {
          success: true,
          deliveredCount: batch.length,
          droppedCount: 0,
          retryable: false,
          statusCode: response.status,
        };
      }

      // Check retryability: 5xx and 429 are retryable, 4xx (except 429) are non-retryable
      const isRetryable = response.status === 429 || response.status >= 500;
      const errorMsg = `HTTP ${response.status}: ${response.statusText}`;

      emitBrowserDiagnostic('HttpDeliveryFailed', errorMsg);

      return {
        success: false,
        deliveredCount: 0,
        droppedCount: isRetryable ? 0 : batch.length,
        retryable: isRetryable,
        error: errorMsg,
        statusCode: response.status,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      emitBrowserDiagnostic('HttpNetworkError', errorMsg, err);

      return {
        success: false,
        deliveredCount: 0,
        droppedCount: 0,
        retryable: true, // Network errors are retryable
        error: errorMsg,
      };
    }
  }

  /**
   * Delivers batch using navigator.sendBeacon during page unload / lifecycle transitions.
   */
  public sendBeaconBatch(batch: readonly SkyraLogEvent[]): boolean {
    if (batch.length === 0) return true;
    if (
      !this._useBeaconOnUnload ||
      typeof navigator === 'undefined' ||
      typeof navigator.sendBeacon !== 'function'
    ) {
      return false;
    }

    try {
      const body = formatBrowserBatch(batch);
      const blob = new Blob([body], { type: 'application/json' });
      return navigator.sendBeacon(this._url, blob);
    } catch (err) {
      emitBrowserDiagnostic('SendBeaconFailed', 'navigator.sendBeacon threw error', err);
      return false;
    }
  }

  public async flush(): Promise<void> {
    // HTTP requests are sent immediately when send() is invoked
  }

  public async dispose(): Promise<void> {
    // No-op
  }
}
