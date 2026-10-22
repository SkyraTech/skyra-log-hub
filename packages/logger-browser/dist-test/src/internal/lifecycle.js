/**
 * @skyra/logger-browser - Page Lifecycle Management
 * Handles visibilitychange and pagehide events to flush pending batches via sendBeacon().
 */
import { emitBrowserDiagnostic } from './diagnostics.js';
export function installLifecycleHandlers(queue) {
    if (typeof window === 'undefined') {
        return () => { };
    }
    const onPageHide = () => {
        try {
            queue.flushLifecycle();
        }
        catch (err) {
            emitBrowserDiagnostic('LifecycleFlushFailed', 'Error in pagehide flush', err);
        }
    };
    const onVisibilityChange = () => {
        try {
            if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
                queue.flushLifecycle();
            }
        }
        catch (err) {
            emitBrowserDiagnostic('LifecycleFlushFailed', 'Error in visibilitychange flush', err);
        }
    };
    try {
        window.addEventListener('pagehide', onPageHide);
        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', onVisibilityChange);
        }
    }
    catch (err) {
        emitBrowserDiagnostic('AddLifecycleFailed', 'Cannot add lifecycle listeners', err);
        return () => { };
    }
    return () => {
        try {
            window.removeEventListener('pagehide', onPageHide);
            if (typeof document !== 'undefined') {
                document.removeEventListener('visibilitychange', onVisibilityChange);
            }
        }
        catch {
            // Ignored
        }
    };
}
//# sourceMappingURL=lifecycle.js.map