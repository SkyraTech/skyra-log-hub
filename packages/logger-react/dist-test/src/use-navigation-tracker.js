/**
 * @skyra/logger-react - useSkyraNavigationTracker Hook
 */
import { useEffect, useRef } from 'react';
import { useSkyraLogger } from './use-skyra-logger.js';
export function useSkyraNavigationTracker(route, metadata) {
    const logger = useSkyraLogger();
    const previousRouteRef = useRef(undefined);
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
//# sourceMappingURL=use-navigation-tracker.js.map