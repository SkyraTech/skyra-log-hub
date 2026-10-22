/**
 * Route template sanitization for Next.js App Router HTTP request logging.
 * Strips sensitive query strings, tokens, credentials, and raw dynamic path parameters
 * to prevent PII and secrets from leaking into log aggregations and metric dimensions.
 */
/**
 * Sanitizes an incoming HTTP URL or route template into a safe, normalized template string.
 *
 * @param rawPath The raw request path or route URL (e.g. `/api/users/123?token=secret`)
 * @param frameworkRoute Optional route template from App Router or config (e.g. `/api/users/[userId]`)
 * @returns A safe, sanitized route template (e.g. `/api/users/[userId]` or `/api/users/:id`)
 */
export declare function sanitizeRouteTemplate(rawPath: string | undefined, frameworkRoute?: string): string;
//# sourceMappingURL=route-sanitizer.d.ts.map