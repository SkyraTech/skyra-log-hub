/**
 * @skyra/logger-browser - Operation Timer Instrumentation
 */

import type { SkyraBrowserLogger } from '../logger.js';
import type { TimerOptions, TimerStopOptions, TimerHandle } from '../types.js';

export function startBrowserTimer(
  logger: SkyraBrowserLogger,
  name: string,
  options?: TimerOptions
): TimerHandle {
  const getNow = (): number => {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      return performance.now();
    }
    return Date.now();
  };

  const startTime = getNow();
  let stopped = false;
  let elapsedMs = 0;

  return {
    stop(stopOptions?: TimerStopOptions): number {
      if (stopped) {
        return elapsedMs;
      }
      stopped = true;
      const endTime = getNow();
      elapsedMs = Math.max(0, endTime - startTime);
      const elapsedNs = Math.round(elapsedMs * 1_000_000);

      const outcome = stopOptions?.outcome ?? (stopOptions?.error ? 'failure' : 'success');
      const level = outcome === 'failure' ? 'error' : 'info';

      logger.log(level, `Operation: ${name}`, {
        action: 'operation.completed',
        outcome,
        durationNs: elapsedNs,
        durationMs: elapsedMs,
        component: options?.component,
        error: stopOptions?.error,
        ...(options?.metadata ?? {}),
        ...(stopOptions?.metadata ?? {}),
      });

      return elapsedMs;
    },
  };
}
