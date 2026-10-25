import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import { DuplicateKeyError } from '@skyra/logger-core';
import { ErrorCode, type StandardErrorPayload } from '../types/error-code.enum.js';
import { GatewayException } from '../types/gateway-exception.js';

@Catch()
export class IngestionExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(IngestionExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    // Extract or generate request ID
    const rawReqId = request.headers['x-request-id'] || request.id;
    const requestId = typeof rawReqId === 'string' ? rawReqId : randomUUID();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = ErrorCode.STORAGE_NOT_READY;
    let message = 'An unexpected internal error occurred.';
    let retryable = false;
    let details: any = undefined;

    if (exception instanceof DuplicateKeyError || (exception as any)?.name === 'DuplicateKeyError') {
      status = HttpStatus.BAD_REQUEST;
      code = ErrorCode.INVALID_JSON;
      message = (exception as any).message;
    } else if (exception instanceof GatewayException) {
      status = exception.getStatus();
      code = exception.code;
      message = exception.message;
      retryable = exception.retryable;
      details = exception.details;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res: any = exception.getResponse();
      message = typeof res === 'string' ? res : res.message || exception.message;

      // Map standard HTTP statuses to canonical error codes
      if (status === HttpStatus.UNAUTHORIZED) {
        code = ErrorCode.UNAUTHORIZED;
      } else if (status === HttpStatus.FORBIDDEN) {
        code = ErrorCode.PROJECT_ACCESS_DENIED;
      } else if (status === HttpStatus.PAYLOAD_TOO_LARGE) {
        code = ErrorCode.PAYLOAD_TOO_LARGE;
      } else if (status === HttpStatus.TOO_MANY_REQUESTS) {
        code = ErrorCode.RATE_LIMIT_EXCEEDED;
        retryable = true;
      } else if (status === HttpStatus.UNPROCESSABLE_ENTITY) {
        code = ErrorCode.SCHEMA_VALIDATION_FAILED;
      } else if (status === HttpStatus.CONFLICT) {
        code = ErrorCode.IDEMPOTENCY_CONFLICT;
      } else if (status === HttpStatus.SERVICE_UNAVAILABLE) {
        code = ErrorCode.STORAGE_NOT_READY;
        retryable = true;
      } else if (status === HttpStatus.BAD_REQUEST) {
        code = ErrorCode.INVALID_JSON;
      }
    } else if (typeof exception === 'object' && exception !== null) {
      const err = exception as any;
      if (err.statusCode === 413 || err.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
        status = HttpStatus.PAYLOAD_TOO_LARGE;
        code = ErrorCode.PAYLOAD_TOO_LARGE;
        message = 'Request payload exceeds the maximum allowable body limit (5 MiB).';
      } else if (err.statusCode === 400 || err.code === 'FST_ERR_CTP_INVALID_CONTENT_TYPE') {
        status = HttpStatus.BAD_REQUEST;
        code = ErrorCode.INVALID_JSON;
        message = err.message || 'Invalid request payload or content-type.';
      } else {
        this.logger.error(`Unhandled internal error: ${err.message}`, err.stack);
      }
    }

    const payload: StandardErrorPayload = {
      error: {
        code,
        message,
        requestId,
        retryable,
        ...(details && details.length > 0 ? { details } : {}),
      },
    };

    response.status(status).header('Content-Type', 'application/json').send(payload);
  }
}

export { IngestionExceptionFilter as HttpExceptionFilter };
