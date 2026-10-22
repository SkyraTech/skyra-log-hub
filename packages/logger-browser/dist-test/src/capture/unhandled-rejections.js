/**
 * @skyra/logger-browser - Unhandled Promise Rejection Capture
 */
import { emitBrowserDiagnostic } from '../internal/diagnostics.js';
let isHandlingRejection = false;
export function installUnhandledRejectionCapture(logger) {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
        return () => { };
    }
    const handler = (event) => {
        if (isHandlingRejection)
            return;
        isHandlingRejection = true;
        try {
            const reason = event.reason;
            let err;
            if (reason instanceof Error) {
                err = reason;
            }
            else if (typeof reason === 'string') {
                err = new Error(reason);
            }
            else if (reason && typeof reason === 'object') {
                try {
                    err = new Error(JSON.stringify(reason));
                }
                catch {
                    err = new Error('Unhandled non-serializable rejection');
                }
            }
            else {
                err = new Error(`Unhandled rejection with value: ${String(reason)}`);
            }
            logger.error(`Unhandled Promise rejection: ${err.message}`, {
                error: err,
                action: 'browser.promise.unhandled_rejection',
            });
        }
        catch (captureErr) {
            emitBrowserDiagnostic('RejectionCaptureFailed', 'Failed to log unhandled rejection', captureErr);
        }
        finally {
            isHandlingRejection = false;
        }
    };
    try {
        window.addEventListener('unhandledrejection', handler);
    }
    catch (err) {
        emitBrowserDiagnostic('AddEventListenerFailed', 'Cannot add unhandledrejection listener', err);
        return () => { };
    }
    return () => {
        try {
            window.removeEventListener('unhandledrejection', handler);
        }
        catch {
            // Ignored
        }
    };
}
//# sourceMappingURL=unhandled-rejections.js.map