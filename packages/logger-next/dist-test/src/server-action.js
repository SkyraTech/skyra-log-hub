import { getSkyraServerLogger } from './logger.js';
import { sanitizeError } from './internal/error-sanitizer.js';
/**
 * Reusable wrapper for Next.js Server Actions and server-side asynchronous functions.
 * Automatically measures execution duration and emits structured telemetry events
 * while strictly preventing raw argument or result data from leaking into logs.
 *
 * @param actionName Dot-notated action name (e.g. 'orders.create', 'auth.password_reset')
 * @param fn The asynchronous server function to execute and measure
 * @param options Configuration options and safe metadata extractors
 */
export function withSkyraAction(actionName, fn, options) {
    return async (...args) => {
        const logger = options?.logger ?? getSkyraServerLogger();
        const startNs = process.hrtime.bigint();
        let safeMetadata = {};
        if (options?.metadata) {
            Object.assign(safeMetadata, options.metadata);
        }
        if (typeof options?.extractMetadata === 'function') {
            try {
                const extracted = options.extractMetadata(...args);
                if (extracted && typeof extracted === 'object') {
                    Object.assign(safeMetadata, extracted);
                }
            }
            catch {
                // Safe metadata extraction must never crash execution
            }
        }
        try {
            const result = await fn(...args);
            const elapsedNs = Number(process.hrtime.bigint() - startNs);
            const elapsedMs = Number((elapsedNs / 1_000_000).toFixed(3));
            let resultMetadata = {};
            if (typeof options?.extractResultMetadata === 'function') {
                try {
                    const extractedRes = options.extractResultMetadata(result);
                    if (extractedRes && typeof extractedRes === 'object') {
                        resultMetadata = extractedRes;
                    }
                }
                catch {
                    // Non-throwing
                }
            }
            const context = {
                action: 'action.completed',
                outcome: 'success',
                category: ['process'],
                durationMs: elapsedMs,
                durationNs: elapsedNs,
                action_name: actionName,
                action_status: 'completed',
                ...safeMetadata,
                ...resultMetadata,
            };
            logger.info(`Server Action ${actionName} completed - ${elapsedMs}ms`, context);
            return result;
        }
        catch (error) {
            const elapsedNs = Number(process.hrtime.bigint() - startNs);
            const elapsedMs = Number((elapsedNs / 1_000_000).toFixed(3));
            const sanitizedErr = sanitizeError(error);
            const context = {
                action: 'action.failed',
                outcome: 'failure',
                category: ['process'],
                durationMs: elapsedMs,
                durationNs: elapsedNs,
                action_name: actionName,
                action_status: 'failed',
                error: {
                    type: sanitizedErr.type,
                    message: sanitizedErr.message,
                    ...(sanitizedErr.code !== undefined ? { code: sanitizedErr.code } : {}),
                    ...(sanitizedErr.stack_trace ? { stack_trace: sanitizedErr.stack_trace } : {}),
                },
                ...safeMetadata,
            };
            logger.error(`Server Action ${actionName} failed - ${elapsedMs}ms [${sanitizedErr.type}: ${sanitizedErr.message}]`, context);
            throw error;
        }
    };
}
//# sourceMappingURL=server-action.js.map