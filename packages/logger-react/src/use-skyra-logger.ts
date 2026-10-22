/**
 * @skyra/logger-react - useSkyraLogger Hook
 */

import { useContext } from 'react';
import type { SkyraBrowserLogger } from '@skyra/logger-browser';
import { SkyraLoggerReactContext, getFallbackLogger } from './skyra-logger-context.js';

export function useSkyraLogger(): SkyraBrowserLogger {
  const contextLogger = useContext(SkyraLoggerReactContext);
  if (!contextLogger) {
    return getFallbackLogger();
  }
  return contextLogger;
}
