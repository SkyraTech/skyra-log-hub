/**
 * @skyra/logger-react - React Context Definition & Safe Fallback
 */

import React from 'react';
import type { LogLevel } from '@skyra/logger-core/types';
import type {
  SkyraBrowserLogger,
  BrowserLoggerStatus,
  TimerOptions,
  TimerHandle,
  TimerStopOptions,
  NavigationEventPayload,
} from '@skyra/logger-browser';

/**
 * Safe no-op fallback logger used when useSkyraLogger is invoked outside
 * of a <SkyraLoggerProvider>.
 *
 * Guaranteed invariants:
 * 1. Creates zero network transport connections
 * 2. Installs zero global event listeners (no window error/rejection capture)
 * 3. Allocates zero batch queue memory
 * 4. Never throws in production
 * 5. Emits a development warning once to notify developers of missing provider
 */
class SafeNoopBrowserLogger {
  private _warned = false;

  private _warnOnce(): void {
    if (!this._warned) {
      this._warned = true;
      if (typeof console !== 'undefined' && typeof console.warn === 'function') {
        console.warn(
          '[SkyraLoggerReact:MissingProvider] useSkyraLogger() was called outside of a <SkyraLoggerProvider>. ' +
          'Logging operations are safe no-ops. Wrap your component tree with <SkyraLoggerProvider logger={...}> ' +
          'to enable logging.'
        );
      }
    }
  }

  public log(_level: LogLevel, _message: unknown, _metadata?: Record<string, unknown>): boolean {
    this._warnOnce();
    return false;
  }

  public trace(_message: unknown, _metadata?: Record<string, unknown>): boolean {
    this._warnOnce();
    return false;
  }

  public debug(_message: unknown, _metadata?: Record<string, unknown>): boolean {
    this._warnOnce();
    return false;
  }

  public info(_message: unknown, _metadata?: Record<string, unknown>): boolean {
    this._warnOnce();
    return false;
  }

  public warn(_message: unknown, _metadata?: Record<string, unknown>): boolean {
    this._warnOnce();
    return false;
  }

  public error(_message: unknown, _metadata?: Record<string, unknown>): boolean {
    this._warnOnce();
    return false;
  }

  public fatal(_message: unknown, _metadata?: Record<string, unknown>): boolean {
    this._warnOnce();
    return false;
  }

  public child(_childContext: Record<string, unknown>): SkyraBrowserLogger {
    this._warnOnce();
    return this as unknown as SkyraBrowserLogger;
  }

  public startTimer(_name: string, _options?: TimerOptions): TimerHandle {
    this._warnOnce();
    return {
      stop: (_options?: TimerStopOptions) => 0,
    };
  }

  public trackNavigation(_payload: NavigationEventPayload): void {
    this._warnOnce();
  }

  public async flush(): Promise<void> {
    // No-op
  }

  public async dispose(): Promise<void> {
    // No-op
  }

  public getStatus(): BrowserLoggerStatus {
    return {
      acceptedCount: 0,
      deliveredCount: 0,
      droppedCount: 0,
      evictedCount: 0,
      failedCount: 0,
      queueDepth: 0,
      queueBytes: 0,
      isDisposed: false,
    };
  }

  public setLevel(_level: LogLevel): void {
    // No-op
  }

  public isLevelEnabled(_level: LogLevel): boolean {
    return false;
  }
}

let fallbackLoggerInstance: SkyraBrowserLogger | null = null;

export function getFallbackLogger(): SkyraBrowserLogger {
  if (!fallbackLoggerInstance) {
    fallbackLoggerInstance = new SafeNoopBrowserLogger() as unknown as SkyraBrowserLogger;
  }
  return fallbackLoggerInstance;
}

export const SkyraLoggerReactContext =
  React.createContext<SkyraBrowserLogger | null>(null);
