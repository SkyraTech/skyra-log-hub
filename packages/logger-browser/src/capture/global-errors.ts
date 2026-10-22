/**
 * @skyra/logger-browser - Global Error Capture
 * Intercepts uncaught browser exceptions safely without interfering with existing listeners.
 */

import type { SkyraBrowserLogger } from '../logger.js';
import { emitBrowserDiagnostic } from '../internal/diagnostics.js';

let isHandlingError = false;

export function installGlobalErrorCapture(
  logger: SkyraBrowserLogger
): () => void {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
    return () => {};
  }

  const handler = (event: ErrorEvent): void => {
    if (isHandlingError) return; // Prevent re-entrancy loops
    isHandlingError = true;

    try {
      const isCrossOrigin =
        event.message === 'Script error.' || (!event.filename && !event.error);

      if (isCrossOrigin) {
        logger.error('Cross-origin script error', {
          error: {
            type: 'ScriptError',
            message: 'Cross-origin script error (stack and message masked by browser CORS policy).',
          },
          action: 'browser.error.uncaught',
        });
        return;
      }

      const err = event.error || new Error(event.message || 'Uncaught error');
      logger.error(`Uncaught error: ${event.message || 'Unknown error'}`, {
        error: err,
        code_location: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        },
        action: 'browser.error.uncaught',
      });
    } catch (captureErr) {
      emitBrowserDiagnostic('ErrorCaptureFailed', 'Failed to log window error', captureErr);
    } finally {
      isHandlingError = false;
    }
  };

  try {
    window.addEventListener('error', handler);
  } catch (err) {
    emitBrowserDiagnostic('AddEventListenerFailed', 'Cannot add window error listener', err);
    return () => {};
  }

  return () => {
    try {
      window.removeEventListener('error', handler);
    } catch {
      // Ignored
    }
  };
}
