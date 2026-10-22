/**
 * @skyra/logger-angular - Dependency Injection Tokens
 */

import { InjectionToken } from '@angular/core';
import type { SkyraBrowserLoggerConfig } from '@skyra/logger-browser';

export const SKYRA_LOGGER_CONFIG = new InjectionToken<SkyraBrowserLoggerConfig>(
  'SKYRA_LOGGER_CONFIG'
);
