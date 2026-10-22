/**
 * Error extraction and sensitive data scrubbing for Next.js application logging.
 * Prevents credentials, database passwords, and secrets from leaking into error logs.
 */

const SECRET_PATTERNS: RegExp[] = [
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
export function sanitizeError(error: unknown): SanitizedErrorInfo {
  if (!error) {
    return {
      type: 'UnknownError',
      message: 'Unknown error occurred (falsy error thrown)',
    };
  }

  let type = 'Error';
  let rawMessage = 'An error occurred';
  let stackTrace: string | undefined;
  let code: string | number | undefined;
  let httpStatus: number | undefined;

  if (error instanceof Error) {
    type = error.name || 'Error';
    rawMessage = error.message || rawMessage;
    stackTrace = error.stack;
    if ('code' in error && (typeof (error as any).code === 'string' || typeof (error as any).code === 'number')) {
      code = (error as any).code;
    }
    if ('status' in error && typeof (error as any).status === 'number') {
      httpStatus = (error as any).status;
    } else if ('statusCode' in error && typeof (error as any).statusCode === 'number') {
      httpStatus = (error as any).statusCode;
    }
  } else if (typeof error === 'string') {
    type = 'StringException';
    rawMessage = error;
  } else if (typeof error === 'object') {
    type = (error as any).name || (error as any).type || 'ObjectException';
    rawMessage = (error as any).message ? String((error as any).message) : JSON.stringify(error);
    if ('code' in error) {
      code = (error as any).code;
    }
    if ('status' in error && typeof (error as any).status === 'number') {
      httpStatus = (error as any).status;
    } else if ('statusCode' in error && typeof (error as any).statusCode === 'number') {
      httpStatus = (error as any).statusCode;
    }
  }

  // Scrub secrets
  const message = scrubSecrets(rawMessage).slice(0, MAX_ERROR_MESSAGE_LENGTH);
  const scrubbedStack = stackTrace ? scrubSecrets(stackTrace).slice(0, MAX_STACK_TRACE_LENGTH) : undefined;

  const result: SanitizedErrorInfo = {
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

function scrubSecrets(input: string): string {
  let result = input;
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, '[REDACTED]');
  }
  return result;
}
