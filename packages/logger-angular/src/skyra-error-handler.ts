/**
 * @skyra/logger-angular - Angular ErrorHandler Integration
 */

import { Injectable, ErrorHandler, Inject, Optional } from '@angular/core';
import { SkyraLoggerService } from './skyra-logger.service.js';

@Injectable()
export class SkyraErrorHandler implements ErrorHandler {
  constructor(
    @Inject(SkyraLoggerService) private readonly _logger: SkyraLoggerService,
    @Optional() @Inject('ORIGINAL_ERROR_HANDLER') private readonly _originalHandler?: ErrorHandler
  ) {}

  public handleError(error: unknown): void {
    const errObj = error instanceof Error ? error : new Error(String(error));

    // Capture and sanitize uncaught Angular error
    this._logger.error(`Angular uncaught error: ${errObj.message}`, {
      error: errObj,
      action: 'angular.error.uncaught',
    });

    // Forward to original handler or console to preserve devtools experience
    if (this._originalHandler && typeof this._originalHandler.handleError === 'function') {
      try {
        this._originalHandler.handleError(error);
      } catch {
        // Prevent recursive failure
      }
    } else if (typeof console !== 'undefined' && typeof console.error === 'function') {
      console.error(error);
    }
  }
}
