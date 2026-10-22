/**
 * @skyra/logger-browser - Navigation Observability
 * Captures clean, parameterized route events without exposing raw URLs, tokens, or query parameters.
 */
import type { SkyraBrowserLogger } from '../logger.js';
import type { NavigationEventPayload } from '../types.js';
export declare function sanitizeRoute(route: string): string;
export declare function trackBrowserNavigation(logger: SkyraBrowserLogger, payload: NavigationEventPayload): void;
//# sourceMappingURL=navigation.d.ts.map