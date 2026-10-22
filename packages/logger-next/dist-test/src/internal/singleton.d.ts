import type { SkyraNextLogger } from '../logger.js';
/**
 * Retrieves the global singleton Next.js logger instance if already registered.
 */
export declare function getGlobalNextLogger(): SkyraNextLogger | undefined;
/**
 * Stores the global singleton Next.js logger instance.
 */
export declare function setGlobalNextLogger(logger: SkyraNextLogger): void;
/**
 * Resets the global singleton (primarily for test isolation).
 */
export declare function resetGlobalNextLogger(): void;
//# sourceMappingURL=singleton.d.ts.map