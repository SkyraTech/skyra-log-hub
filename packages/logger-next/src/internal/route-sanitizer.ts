/**
 * Route template sanitization for Next.js App Router HTTP request logging.
 * Strips sensitive query strings, tokens, credentials, and raw dynamic path parameters
 * to prevent PII and secrets from leaking into log aggregations and metric dimensions.
 */

const UUID_REGEX = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g;
const NUMERIC_ID_REGEX = /\/\d+(?=\/|$)/g;
const MONGO_OR_HEX_ID_REGEX = /\/[0-9a-fA-F]{24}(?=\/|$)/g;
const MAX_ROUTE_LENGTH = 256;

/**
 * Sanitizes an incoming HTTP URL or route template into a safe, normalized template string.
 *
 * @param rawPath The raw request path or route URL (e.g. `/api/users/123?token=secret`)
 * @param frameworkRoute Optional route template from App Router or config (e.g. `/api/users/[userId]`)
 * @returns A safe, sanitized route template (e.g. `/api/users/[userId]` or `/api/users/:id`)
 */
export function sanitizeRouteTemplate(rawPath: string | undefined, frameworkRoute?: string): string {
  if (frameworkRoute && typeof frameworkRoute === 'string' && frameworkRoute.trim().length > 0) {
    let sanitized = frameworkRoute.trim();
    const queryIdx = sanitized.indexOf('?');
    if (queryIdx !== -1) {
      sanitized = sanitized.slice(0, queryIdx);
    }
    const hashIdx = sanitized.indexOf('#');
    if (hashIdx !== -1) {
      sanitized = sanitized.slice(0, hashIdx);
    }
    return boundRoute(sanitized);
  }

  if (rawPath === undefined || rawPath === null) {
    return '/unknown';
  }

  let path = rawPath.trim();

  // 1. Strip query string
  const queryIndex = path.indexOf('?');
  if (queryIndex !== -1) {
    path = path.slice(0, queryIndex);
  }

  // 2. Strip hash fragment
  const hashIndex = path.indexOf('#');
  if (hashIndex !== -1) {
    path = path.slice(0, hashIndex);
  }

  // 3. Fallback to / if empty
  if (path.length === 0) {
    return '/';
  }

  // 4. Privacy protection: unknown or unmatched routes containing email addresses or tokens fall back to safe placeholder
  if (path.includes('@') || /[a-fA-F0-9]{32,}/.test(path)) {
    return '[unmatched-route]';
  }

  // 5. Parameterize raw IDs in path segments
  path = path.replace(UUID_REGEX, ':id');
  path = path.replace(MONGO_OR_HEX_ID_REGEX, '/:id');
  path = path.replace(NUMERIC_ID_REGEX, '/:id');

  return boundRoute(path);
}

function boundRoute(route: string): string {
  if (route.length > MAX_ROUTE_LENGTH) {
    return route.slice(0, MAX_ROUTE_LENGTH);
  }
  return route;
}
