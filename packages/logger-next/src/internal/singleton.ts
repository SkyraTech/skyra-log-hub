import type { SkyraNextLogger } from '../logger.js';

const SINGLETON_KEY = Symbol.for('skyra.logger.next.singleton');

interface GlobalWithLogger {
  [SINGLETON_KEY]?: SkyraNextLogger;
}

const globalScope = globalThis as unknown as GlobalWithLogger;

/**
 * Retrieves the global singleton Next.js logger instance if already registered.
 */
export function getGlobalNextLogger(): SkyraNextLogger | undefined {
  return globalScope[SINGLETON_KEY];
}

/**
 * Stores the global singleton Next.js logger instance.
 */
export function setGlobalNextLogger(logger: SkyraNextLogger): void {
  globalScope[SINGLETON_KEY] = logger;
}

/**
 * Resets the global singleton (primarily for test isolation).
 */
export function resetGlobalNextLogger(): void {
  delete globalScope[SINGLETON_KEY];
}
