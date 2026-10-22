/**
 * @skyra/logger-browser - Context Storage and Scope Propagation
 */

import { isValidTraceId, isValidSpanId } from './internal/correlation.js';

export interface BrowserContextData {
  readonly traceId?: string;
  readonly spanId?: string;
  readonly correlationId?: string;
  readonly component?: string;
  readonly labels?: Record<string, string>;
  readonly tags?: readonly string[];
  readonly custom?: Record<string, unknown>;
}

export class BrowserContext {
  private _current: BrowserContextData = {};

  public get(): Readonly<BrowserContextData> {
    return this._current;
  }

  public set(data: Partial<BrowserContextData>): void {
    const validated: Record<string, unknown> = { ...this._current };

    if (data.traceId !== undefined) {
      if (data.traceId && !isValidTraceId(data.traceId)) {
        throw new Error(
          `Invalid traceId: "${data.traceId}". Must be 32 non-zero hex digits.`
        );
      }
      validated['traceId'] = data.traceId ? data.traceId.toLowerCase() : undefined;
    }

    if (data.spanId !== undefined) {
      if (data.spanId && !isValidSpanId(data.spanId)) {
        throw new Error(
          `Invalid spanId: "${data.spanId}". Must be 16 non-zero hex digits.`
        );
      }
      validated['spanId'] = data.spanId ? data.spanId.toLowerCase() : undefined;
    }

    if (data.correlationId !== undefined) {
      validated['correlationId'] = data.correlationId
        ? String(data.correlationId).slice(0, 128)
        : undefined;
    }

    if (data.component !== undefined) {
      validated['component'] = data.component
        ? String(data.component).slice(0, 64)
        : undefined;
    }

    if (data.labels !== undefined) {
      validated['labels'] = { ...(this._current.labels ?? {}), ...data.labels };
    }

    if (data.tags !== undefined) {
      const existing = this._current.tags ?? [];
      validated['tags'] = Array.from(new Set([...existing, ...data.tags]));
    }

    if (data.custom !== undefined) {
      validated['custom'] = { ...(this._current.custom ?? {}), ...data.custom };
    }

    this._current = validated as BrowserContextData;
  }

  public clear(): void {
    this._current = {};
  }

  public withContext<T>(
    scopedData: Partial<BrowserContextData>,
    fn: () => T
  ): T {
    const previous = this._current;
    try {
      this.set(scopedData);
      return fn();
    } finally {
      this._current = previous;
    }
  }

  public async withContextAsync<T>(
    scopedData: Partial<BrowserContextData>,
    fn: () => Promise<T>
  ): Promise<T> {
    const previous = this._current;
    try {
      this.set(scopedData);
      return await fn();
    } finally {
      this._current = previous;
    }
  }
}

export const defaultBrowserContext = new BrowserContext();
