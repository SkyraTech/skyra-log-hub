/**
 * @skyra/logger-react - SkyraLoggerProvider Component
 */

import React, { useMemo, useEffect, useRef, type ReactNode } from 'react';
import {
  createSkyraBrowserLogger,
  SkyraBrowserLogger,
  type SkyraBrowserLoggerConfig,
} from '@skyra/logger-browser';
import { SkyraLoggerReactContext } from './skyra-logger-context.js';

export interface SkyraLoggerProviderProps {
  readonly children?: ReactNode;
  readonly logger?: SkyraBrowserLogger;
  readonly config?: SkyraBrowserLoggerConfig;
}

export function SkyraLoggerProvider({
  children,
  logger,
  config,
}: SkyraLoggerProviderProps): React.JSX.Element {
  const isOwnerRef = useRef(false);

  const activeLogger = useMemo(() => {
    if (logger) {
      isOwnerRef.current = false;
      return logger;
    }
    if (config) {
      isOwnerRef.current = true;
      return createSkyraBrowserLogger(config);
    }
    // Default fallback
    isOwnerRef.current = true;
    return createSkyraBrowserLogger({
      projectId: 'skyra-react',
      serviceName: 'react-app',
      environment: 'development',
      transport: { type: 'console' },
    });
  }, [logger, config]);

  useEffect(() => {
    return () => {
      // Only dispose if this provider instance owns the logger
      if (isOwnerRef.current) {
        void activeLogger.dispose();
      }
    };
  }, [activeLogger]);

  return (
    <SkyraLoggerReactContext.Provider value={activeLogger}>
      {children}
    </SkyraLoggerReactContext.Provider>
  );
}
