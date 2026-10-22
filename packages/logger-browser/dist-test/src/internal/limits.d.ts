/**
 * @skyra/logger-browser - Resource Limits and Sanitization Engine
 */
import type { EcsError } from '@skyra/logger-core/types';
import type { ResolvedBrowserLimits } from '../config.js';
export declare function sanitizeMessage(rawMessage: unknown, maxLength?: number): string;
export declare function extractEcsError(error: unknown): EcsError;
export declare function sanitizeMetadata(input: unknown, limits: ResolvedBrowserLimits): Record<string, unknown> | undefined;
//# sourceMappingURL=limits.d.ts.map