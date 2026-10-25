import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode, type ValidationErrorDetail } from './error-code.enum.js';

export interface GatewayExceptionOptions {
  status: HttpStatus;
  code: ErrorCode;
  message: string;
  retryable?: boolean;
  details?: ValidationErrorDetail[] | Record<string, unknown>;
}

export class GatewayException extends HttpException {
  public readonly code: ErrorCode;
  public readonly retryable: boolean;
  public readonly details?: any;

  constructor(
    codeOrOptions: ErrorCode | GatewayExceptionOptions,
    message?: string,
    status?: HttpStatus,
    extra?: { retryable?: boolean; details?: any },
  ) {
    if (typeof codeOrOptions === 'object') {
      super(codeOrOptions.message, codeOrOptions.status);
      this.code = codeOrOptions.code;
      this.retryable = codeOrOptions.retryable ?? false;
      this.details = codeOrOptions.details;
    } else {
      super(message ?? 'Gateway Exception', status ?? HttpStatus.INTERNAL_SERVER_ERROR);
      this.code = codeOrOptions;
      this.retryable = extra?.retryable ?? false;
      this.details = extra?.details;
    }
  }
}
