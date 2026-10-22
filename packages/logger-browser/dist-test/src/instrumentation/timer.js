/**
 * @skyra/logger-browser - Operation Timer Instrumentation
 */
export function startBrowserTimer(logger, name, options) {
    const getNow = () => {
        if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
            return performance.now();
        }
        return Date.now();
    };
    const startTime = getNow();
    let stopped = false;
    let elapsedMs = 0;
    return {
        stop(stopOptions) {
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
//# sourceMappingURL=timer.js.map