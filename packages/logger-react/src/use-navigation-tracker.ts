/**
 * @skyra/logger-react - useSkyraNavigationTracker Hook
 */

import { useEffect, useRef } from 'react';
import { useSkyraLogger } from './use-skyra-logger.js';

export function useSkyraNavigationTracker(
  route: string,
  metadata?: Record<string, unknown>
): void {
  const logger = useSkyraLogger();
  const previousRouteRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (route) {
      logger.trackNavigation({
        route,
        previousRoute: previousRouteRef.current,
        action: 'react.navigation.completed',
        metadata,
      });
      previousRouteRef.current = route;
    }
  }, [logger, route, metadata]);
}
