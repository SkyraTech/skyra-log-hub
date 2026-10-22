const SINGLETON_KEY = Symbol.for('skyra.logger.next.singleton');
const globalScope = globalThis;
/**
 * Retrieves the global singleton Next.js logger instance if already registered.
 */
export function getGlobalNextLogger() {
    return globalScope[SINGLETON_KEY];
}
/**
 * Stores the global singleton Next.js logger instance.
 */
export function setGlobalNextLogger(logger) {
    globalScope[SINGLETON_KEY] = logger;
}
/**
 * Resets the global singleton (primarily for test isolation).
 */
export function resetGlobalNextLogger() {
    delete globalScope[SINGLETON_KEY];
}
//# sourceMappingURL=singleton.js.map