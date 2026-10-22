/**
 * @skyra/logger-angular - Standalone Application Providers
 */

import {
  makeEnvironmentProviders,
  type EnvironmentProviders,
  type Provider,
  ErrorHandler,
} from '@angular/core';
import type { SkyraBrowserLoggerConfig } from '@skyra/logger-browser';
import { SKYRA_LOGGER_CONFIG } from './tokens.js';
import { SkyraLoggerService } from './skyra-logger.service.js';
import { SkyraErrorHandler } from './skyra-error-handler.js';
import { SkyraRouterTracker } from './skyra-router-tracker.js';

export { SKYRA_LOGGER_CONFIG };

export interface SkyraAngularOptions {
  readonly withErrorHandler?: boolean;
  readonly withRouterTracking?: boolean;
}

export function provideSkyraLogger(
  config: SkyraBrowserLoggerConfig,
  options?: SkyraAngularOptions
): EnvironmentProviders {
  const providers: Provider[] = [
    { provide: SKYRA_LOGGER_CONFIG, useValue: config },
    SkyraLoggerService,
  ];

  if (options?.withErrorHandler !== false) {
    providers.push({
      provide: ErrorHandler,
      useClass: SkyraErrorHandler,
    });
  }

  if (options?.withRouterTracking) {
    providers.push(SkyraRouterTracker);
  }

  return makeEnvironmentProviders(providers);
}
