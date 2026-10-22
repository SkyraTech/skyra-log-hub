/**
 * @skyra/logger-react - React Context Definition & Fallback
 */

import React from 'react';
import {
  createSkyraBrowserLogger,
  SkyraBrowserLogger,
} from '@skyra/logger-browser';

let fallbackLoggerInstance: SkyraBrowserLogger | null = null;

export function getFallbackLogger(): SkyraBrowserLogger {
  if (!fallbackLoggerInstance) {
    fallbackLoggerInstance = createSkyraBrowserLogger({
      projectId: 'skyra-react-fallback',
      serviceName: 'react-app',
      environment: 'development',
      transport: { type: 'console' },
    });
  }
  return fallbackLoggerInstance;
}

export const SkyraLoggerReactContext =
  React.createContext<SkyraBrowserLogger | null>(null);
