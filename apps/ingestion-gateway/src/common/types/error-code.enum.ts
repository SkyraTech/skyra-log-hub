/**
 * Standard Ingestion Error Codes
 * Aligned with contracts/ingestion/v1/error-response.schema.json
 */
export enum ErrorCode {
  INVALID_JSON = 'INVALID_JSON',
  SCHEMA_VALIDATION_FAILED = 'SCHEMA_VALIDATION_FAILED',
  BATCH_EMPTY = 'BATCH_EMPTY',
  BATCH_OVERSIZED = 'BATCH_OVERSIZED',
  PAYLOAD_TOO_LARGE = 'PAYLOAD_TOO_LARGE',
  UNAUTHORIZED = 'UNAUTHORIZED',
  PROJECT_ACCESS_DENIED = 'PROJECT_ACCESS_DENIED',
  ENVIRONMENT_MISMATCH = 'ENVIRONMENT_MISMATCH',
  IDEMPOTENCY_CONFLICT = 'IDEMPOTENCY_CONFLICT',
  UNSUPPORTED_PROTOCOL_VERSION = 'UNSUPPORTED_PROTOCOL_VERSION',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  STORAGE_NOT_READY = 'STORAGE_NOT_READY',
  JOURNAL_UNAVAILABLE = 'JOURNAL_UNAVAILABLE',
}

export interface ValidationErrorDetail {
  path: string;
  message: string;
}

export interface StandardErrorPayload {
  error: {
    code: ErrorCode;
    message: string;
    requestId: string;
    retryable: boolean;
    details?: ValidationErrorDetail[];
  };
}
