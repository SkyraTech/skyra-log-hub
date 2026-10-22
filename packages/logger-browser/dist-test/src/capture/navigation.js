/**
 * @skyra/logger-browser - Navigation Observability
 * Captures clean, parameterized route events without exposing raw URLs, tokens, or query parameters.
 */
export function sanitizeRoute(route) {
    if (!route || typeof route !== 'string')
        return '/';
    const clean = route.trim().split('?')[0].split('#')[0];
    return clean.startsWith('/') ? clean : `/${clean}`;
}
export function trackBrowserNavigation(logger, payload) {
    const cleanRoute = sanitizeRoute(payload.route);
    const cleanPrevious = payload.previousRoute ? sanitizeRoute(payload.previousRoute) : undefined;
    logger.info(`Navigation: ${cleanRoute}`, {
        route: cleanRoute,
        previous_route: cleanPrevious,
        action: payload.action ?? 'navigation.completed',
        outcome: payload.outcome ?? 'success',
        ...(payload.metadata ?? {}),
    });
}
//# sourceMappingURL=navigation.js.map