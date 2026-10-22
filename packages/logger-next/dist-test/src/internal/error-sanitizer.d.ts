/**
 * Error extraction and sensitive data scrubbing for Next.js application logging.
 * Prevents credentials, database passwords, and secrets from leaking into error logs.
 */
export interface SanitizedErrorInfo {
    type: string;
    message: string;
    code?: string | number;
    stack_trace?: string;
    httpStatus?: number;
}
/**
 * Extracts and scrubs an error object into a canonical ECS error structure.
 */
export declare function sanitizeError(error: unknown): SanitizedErrorInfo;
//# sourceMappingURL=error-sanitizer.d.ts.map