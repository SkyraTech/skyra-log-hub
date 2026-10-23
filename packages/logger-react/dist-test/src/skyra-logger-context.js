/**
 * @skyra/logger-react - React Context Definition & Safe Fallback
 */
import React from 'react';
/**
 * Safe no-op fallback logger used when useSkyraLogger is invoked outside
 * of a <SkyraLoggerProvider>.
 *
 * Guaranteed invariants:
 * 1. Creates zero network transport connections
 * 2. Installs zero global event listeners (no window error/rejection capture)
 * 3. Allocates zero batch queue memory
 * 4. Never throws in production
 * 5. Emits a development warning once to notify developers of missing provider
 */
class SafeNoopBrowserLogger {
    _warned = false;
    _warnOnce() {
        if (!this._warned) {
            this._warned = true;
            if (typeof console !== 'undefined' && typeof console.warn === 'function') {
                console.warn('[SkyraLoggerReact:MissingProvider] useSkyraLogger() was called outside of a <SkyraLoggerProvider>. ' +
                    'Logging operations are safe no-ops. Wrap your component tree with <SkyraLoggerProvider logger={...}> ' +
                    'to enable logging.');
            }
        }
    }
    log(_level, _message, _metadata) {
        this._warnOnce();
        return false;
    }
    trace(_message, _metadata) {
        this._warnOnce();
        return false;
    }
    debug(_message, _metadata) {
        this._warnOnce();
        return false;
    }
    info(_message, _metadata) {
        this._warnOnce();
        return false;
    }
    warn(_message, _metadata) {
        this._warnOnce();
        return false;
    }
    error(_message, _metadata) {
        this._warnOnce();
        return false;
    }
    fatal(_message, _metadata) {
        this._warnOnce();
        return false;
    }
    child(_childContext) {
        this._warnOnce();
        return this;
    }
    startTimer(_name, _options) {
        this._warnOnce();
        return {
            stop: (_options) => 0,
        };
    }
    trackNavigation(_payload) {
        this._warnOnce();
    }
    async flush() {
        // No-op
    }
    async dispose() {
        // No-op
    }
    getStatus() {
        return {
            acceptedCount: 0,
            deliveredCount: 0,
            droppedCount: 0,
            evictedCount: 0,
            failedCount: 0,
            queueDepth: 0,
            queueBytes: 0,
            isDisposed: false,
        };
    }
    setLevel(_level) {
        // No-op
    }
    isLevelEnabled(_level) {
        return false;
    }
}
let fallbackLoggerInstance = null;
export function getFallbackLogger() {
    if (!fallbackLoggerInstance) {
        fallbackLoggerInstance = new SafeNoopBrowserLogger();
    }
    return fallbackLoggerInstance;
}
export const SkyraLoggerReactContext = React.createContext(null);
//# sourceMappingURL=skyra-logger-context.js.map