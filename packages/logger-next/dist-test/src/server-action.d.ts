import type { SkyraNextLogger } from './logger.js';
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
export declare function withSkyraAction<TArgs extends any[], TReturn>(actionName: string, fn: (...args: TArgs) => Promise<TReturn>, options?: ServerActionOptions<TArgs, TReturn>): (...args: TArgs) => Promise<TReturn>;
//# sourceMappingURL=server-action.d.ts.map