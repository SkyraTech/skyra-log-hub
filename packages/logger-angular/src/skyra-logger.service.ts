/**
 * @skyra/logger-angular - Angular Injectable Logger Service
 */

import { Injectable, Inject, Optional, OnDestroy } from '@angular/core';
import {
  createSkyraBrowserLogger,
  SkyraBrowserLogger,
  type SkyraBrowserLoggerConfig,
  type LogLevel,
  type BrowserLoggerStatus,
  type TimerOptions,
  type TimerHandle,
  type NavigationEventPayload,
} from '@skyra/logger-browser';
import { SKYRA_LOGGER_CONFIG } from './tokens.js';

@Injectable({
  providedIn: 'root',
})
export class SkyraLoggerService implements OnDestroy {
  private readonly _logger: SkyraBrowserLogger;

  constructor(
    @Optional() @Inject(SKYRA_LOGGER_CONFIG) config?: SkyraBrowserLoggerConfig
  ) {
    if (!config) {
      // Safe fallback config if provider not explicitly registered
      this._logger = createSkyraBrowserLogger({
        projectId: 'skyra-angular',
        serviceName: 'angular-app',
        environment: 'development',
        transport: { type: 'console' },
      });
    } else {
      this._logger = createSkyraBrowserLogger(config);
    }
  }

  public get underlyingLogger(): SkyraBrowserLogger {
    return this._logger;
  }

  public isLevelEnabled(level: LogLevel): boolean {
    return this._logger.isLevelEnabled(level);
  }

  public setLevel(level: LogLevel): void {
    this._logger.setLevel(level);
  }

  public getLevel(): LogLevel {
    return this._logger.getLevel();
  }

  public log(level: LogLevel, message: unknown, metadata?: Record<string, unknown>): boolean {
    return this._logger.log(level, message, metadata);
  }

  public trace(message: unknown, metadata?: Record<string, unknown>): boolean {
    return this._logger.trace(message, metadata);
  }

  public debug(message: unknown, metadata?: Record<string, unknown>): boolean {
    return this._logger.debug(message, metadata);
  }

  public info(message: unknown, metadata?: Record<string, unknown>): boolean {
    return this._logger.info(message, metadata);
  }

  public warn(message: unknown, metadata?: Record<string, unknown>): boolean {
    return this._logger.warn(message, metadata);
  }

  public error(message: unknown, metadata?: Record<string, unknown>): boolean {
    return this._logger.error(message, metadata);
  }

  public fatal(message: unknown, metadata?: Record<string, unknown>): boolean {
    return this._logger.fatal(message, metadata);
  }

  public child(context: {
    component?: string;
    labels?: Record<string, string>;
    tags?: readonly string[];
    custom?: Record<string, unknown>;
  }): SkyraBrowserLogger {
    return this._logger.child(context);
  }

  public startTimer(name: string, options?: TimerOptions): TimerHandle {
    return this._logger.startTimer(name, options);
  }

  public trackNavigation(payload: NavigationEventPayload): void {
    this._logger.trackNavigation(payload);
  }

  public async flush(): Promise<void> {
    await this._logger.flush();
  }

  public async dispose(): Promise<void> {
    await this._logger.dispose();
  }

  public getStatus(): BrowserLoggerStatus {
    return this._logger.getStatus();
  }

  public ngOnDestroy(): void {
    void this.dispose();
  }
}
