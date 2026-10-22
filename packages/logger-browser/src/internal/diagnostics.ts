/**
 * @skyra/logger-browser - Safe Internal Diagnostic Reporter
 */

let isEmitting = false;

export function emitBrowserDiagnostic(
  code: string,
  message: string,
  error?: unknown
): void {
  if (isEmitting) return; // Prevent re-entrancy loops
  isEmitting = true;
  try {
    if (typeof console !== 'undefined' && typeof console.warn === 'function') {
      const errStr =
        error instanceof Error
          ? ` [error=${error.name}: ${error.message}]`
          : error
            ? ` [error=${String(error)}]`
            : '';
      console.warn(`[SkyraBrowserLogger:${code}] ${message}${errStr}`);
    }
  } catch {
    // Fail-safe: never crash caller application
  } finally {
    isEmitting = false;
  }
}
