/**
 * Error extraction and sensitive data scrubbing for Next.js application logging.
 * Prevents credentials, database passwords, and secrets from leaking into error logs.
 */
const SECRET_PATTERNS = [
    /password=["']?[^"'\s]+["']?/gi,
    /bearer\s+[a-zA-Z0-9_\-\.]+/gi,
    /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/gi, // JWT
    /(?:token|secret|apiKey|api_key|auth)=["']?[^"'\s&]+["']?/gi,
    /postgres:\/\/[^:]+:[^@]+@[^/]+/gi,
    /mysql:\/\/[^:]+:[^@]+@[^/]+/gi,
    /mongodb(?:\+srv)?:\/\/[^:]+:[^@]+@[^/]+/gi,
];
const MAX_ERROR_MESSAGE_LENGTH = 4096;
const MAX_STACK_TRACE_LENGTH = 16384;
/**
 * Extracts and scrubs an error object into a canonical ECS error structure.
 */
export function sanitizeError(error) {
    if (!error) {
        return {
            type: 'UnknownError',
            message: 'Unknown error occurred (falsy error thrown)',
        };
    }
    let type = 'Error';
    let rawMessage = 'An error occurred';
    let stackTrace;
    let code;
    let httpStatus;
    if (error instanceof Error) {
        type = error.name || 'Error';
        rawMessage = error.message || rawMessage;
        stackTrace = error.stack;
        if ('code' in error && (typeof error.code === 'string' || typeof error.code === 'number')) {
            code = error.code;
        }
        if ('status' in error && typeof error.status === 'number') {
            httpStatus = error.status;
        }
        else if ('statusCode' in error && typeof error.statusCode === 'number') {
            httpStatus = error.statusCode;
        }
    }
    else if (typeof error === 'string') {
        type = 'StringException';
        rawMessage = error;
    }
    else if (typeof error === 'object') {
        type = error.name || error.type || 'ObjectException';
        rawMessage = error.message ? String(error.message) : JSON.stringify(error);
        if ('code' in error) {
            code = error.code;
        }
        if ('status' in error && typeof error.status === 'number') {
            httpStatus = error.status;
        }
        else if ('statusCode' in error && typeof error.statusCode === 'number') {
            httpStatus = error.statusCode;
        }
    }
    // Scrub secrets
    const message = scrubSecrets(rawMessage).slice(0, MAX_ERROR_MESSAGE_LENGTH);
    const scrubbedStack = stackTrace ? scrubSecrets(stackTrace).slice(0, MAX_STACK_TRACE_LENGTH) : undefined;
    const result = {
        type: type.slice(0, 256),
        message,
    };
    if (code !== undefined) {
        result.code = code;
    }
    if (scrubbedStack) {
        result.stack_trace = scrubbedStack;
    }
    if (httpStatus !== undefined) {
        result.httpStatus = httpStatus;
    }
    return result;
}
function scrubSecrets(input) {
    let result = input;
    for (const pattern of SECRET_PATTERNS) {
        result = result.replace(pattern, '[REDACTED]');
    }
    return result;
}
//# sourceMappingURL=error-sanitizer.js.map