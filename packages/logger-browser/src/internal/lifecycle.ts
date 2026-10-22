/**
 * @skyra/logger-browser - Page Lifecycle Management
 * Handles visibilitychange and pagehide events to flush pending batches via sendBeacon().
 */

import type { BatchQueue } from './batch-queue.js';
import { emitBrowserDiagnostic } from './diagnostics.js';

export function installLifecycleHandlers(queue: BatchQueue): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const onPageHide = (): void => {
    try {
      queue.flushLifecycle();
    } catch (err) {
      emitBrowserDiagnostic('LifecycleFlushFailed', 'Error in pagehide flush', err);
    }
  };

  const onVisibilityChange = (): void => {
    try {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        queue.flushLifecycle();
      }
    } catch (err) {
      emitBrowserDiagnostic('LifecycleFlushFailed', 'Error in visibilitychange flush', err);
    }
  };

  try {
    window.addEventListener('pagehide', onPageHide);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange);
    }
  } catch (err) {
    emitBrowserDiagnostic('AddLifecycleFailed', 'Cannot add lifecycle listeners', err);
    return () => {};
  }

  return () => {
    try {
      window.removeEventListener('pagehide', onPageHide);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
    } catch {
      // Ignored
    }
  };
}
