import type { LogContext } from '@skyra/logger-node';
import type { SkyraNextLogger } from './logger.js';
import { getSkyraServerLogger } from './logger.js';
import { sanitizeError } from './internal/error-sanitizer.js';

export interface ServerActionOptions<TArgs extends any[] = any[], TReturn = any> {
  /** Optional custom logger instance (defaults to server logger singleton) */
  logger?: SkyraNextLogger;
  /** Static metadata to attach to the action event (strictly no PII or secrets) */
  metadata?: Record<string, unknown>;
  /** Optional callback to extract safe, non-sensitive audit metadata from arguments */
  extractMetadata?: (...args: TArgs) => Record<string, unknown>;
  /** Optional callback to extract safe outcome metadata from return value */
  extractResultMetadata?: (result: TReturn) => Record<string, unknown>;
}

/**
 * Reusable wrapper for Next.js Server Actions and server-side asynchronous functions.
 * Automatically measures execution duration and emits structured telemetry events
 * while strictly preventing raw argument or result data from leaking into logs.
 *
 * @param actionName Dot-notated action name (e.g. 'orders.create', 'auth.password_reset')
 * @param fn The asynchronous server function to execute and measure
 * @param options Configuration options and safe metadata extractors
 */
export function withSkyraAction<TArgs extends any[], TReturn>(
  actionName: string,
  fn: (...args: TArgs) => Promise<TReturn>,
  options?: ServerActionOptions<TArgs, TReturn>
): (...args: TArgs) => Promise<TReturn> {
  return async (...args: TArgs): Promise<TReturn> => {
    const logger = options?.logger ?? getSkyraServerLogger();
    const startNs = process.hrtime.bigint();

    let safeMetadata: Record<string, unknown> = {};
    if (options?.metadata) {
      Object.assign(safeMetadata, options.metadata);
    }
    if (typeof options?.extractMetadata === 'function') {
      try {
        const extracted = options.extractMetadata(...args);
        if (extracted && typeof extracted === 'object') {
          Object.assign(safeMetadata, extracted);
        }
      } catch {
        // Safe metadata extraction must never crash execution
      }
    }

    try {
      const result = await fn(...args);
      const elapsedNs = Number(process.hrtime.bigint() - startNs);
      const elapsedMs = Number((elapsedNs / 1_000_000).toFixed(3));

      let resultMetadata: Record<string, unknown> = {};
      if (typeof options?.extractResultMetadata === 'function') {
        try {
          const extractedRes = options.extractResultMetadata(result);
          if (extractedRes && typeof extractedRes === 'object') {
            resultMetadata = extractedRes;
          }
        } catch {
          // Non-throwing
        }
      }

      const context: LogContext = {
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
    } catch (error) {
      const elapsedNs = Number(process.hrtime.bigint() - startNs);
      const elapsedMs = Number((elapsedNs / 1_000_000).toFixed(3));
      const sanitizedErr = sanitizeError(error);

      const context: LogContext = {
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
