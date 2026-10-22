import { redactSensitiveData, REDACTED_MASK } from '@skyra/logger-core';

export interface SanitizedErrorInfo {
  type: string;
  message: string;
  code?: string | number;
  stack_trace?: string;
  httpStatus?: number;
}

const MAX_ERROR_MESSAGE_LENGTH = 4_096;
const MAX_STACK_TRACE_LENGTH = 16_384;

const INLINE_KEY_VALUE_SECRET_REGEX =
  /(["']?(?:password|passwd|pwd|secret|token|apiKey|api_key|access_token|refresh_token)["']?\s*[:=]\s*["']?)[^"'\s,;]+/gi;

function scrubErrorText(text: string): string {
  // 1. Core redaction (handles Bearer tokens, raw JWTs, URL credentials, PEM blocks, PAN credit cards)
  let scrubbed = String(redactSensitiveData(text));
  // 2. Additional defense-in-depth for key-value assignments (e.g. password="secret" or password=secret)
  scrubbed = scrubbed.replace(INLINE_KEY_VALUE_SECRET_REGEX, `$1${REDACTED_MASK}`);
  return scrubbed;
}

/**
 * Sanitizes errors and exceptions for structured logging without leaking sensitive values.
 */
export function sanitizeError(err: unknown): SanitizedErrorInfo {
  if (!err) {
    return {
      type: 'UnknownError',
      message: 'Unknown error occurred',
    };
  }

  // Handle standard Error / NestJS HttpException / Custom Errors
  if (err instanceof Error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyErr = err as any;
    const type = anyErr.name || anyErr.constructor?.name || 'Error';

    // Extract HTTP status if available
    let httpStatus: number | undefined;
    if (typeof anyErr.getStatus === 'function') {
      try {
        const s = anyErr.getStatus();
        if (typeof s === 'number') httpStatus = s;
      } catch {
        // Ignore failure
      }
    } else if (typeof anyErr.status === 'number') {
      httpStatus = anyErr.status;
    } else if (typeof anyErr.statusCode === 'number') {
      httpStatus = anyErr.statusCode;
    }

    // Extract code
    let code: string | number | undefined;
    if (typeof anyErr.code === 'string' || typeof anyErr.code === 'number') {
      code = anyErr.code;
    }

    // Sanitize raw message against credentials
    const rawMessage = anyErr.message || 'An error occurred';
    const redactedMsg = scrubErrorText(rawMessage);
    const message = redactedMsg.length > MAX_ERROR_MESSAGE_LENGTH
      ? redactedMsg.slice(0, MAX_ERROR_MESSAGE_LENGTH)
      : redactedMsg;

    // Sanitize stack trace
    let stack_trace: string | undefined;
    if (typeof anyErr.stack === 'string') {
      const redactedStack = scrubErrorText(anyErr.stack);
      stack_trace = redactedStack.length > MAX_STACK_TRACE_LENGTH
        ? redactedStack.slice(0, MAX_STACK_TRACE_LENGTH)
        : redactedStack;
    }

    return {
      type: type.slice(0, 256),
      message,
      code,
      stack_trace,
      httpStatus,
    };
  }

  // Handle non-Error objects or string throws
  if (typeof err === 'string') {
    const redactedMsg = scrubErrorText(err);
    return {
      type: 'StringException',
      message: redactedMsg.slice(0, MAX_ERROR_MESSAGE_LENGTH),
    };
  }

  if (typeof err === 'object') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyObj = err as any;
    const type = anyObj.type || anyObj.name || 'ObjectException';
    const rawMsg = anyObj.message ? String(anyObj.message) : JSON.stringify(redactSensitiveData(anyObj));
    return {
      type: String(type).slice(0, 256),
      message: scrubErrorText(rawMsg).slice(0, MAX_ERROR_MESSAGE_LENGTH),
    };
  }

  return {
    type: 'PrimitiveException',
    message: scrubErrorText(String(err)).slice(0, MAX_ERROR_MESSAGE_LENGTH),
  };
}
