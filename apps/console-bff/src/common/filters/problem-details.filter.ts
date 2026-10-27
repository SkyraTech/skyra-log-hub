import {
  type ExceptionFilter,
  Catch,
  type ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { BffDomainException } from '../errors/bff.errors.js';

export interface ProblemDetailsResponse {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  code: string;
  invalid_params?: Array<{ name: string; reason: string }>;
}

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  public catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    const correlationId =
      (request.headers['x-correlation-id'] as string) ||
      (request.headers['x-request-id'] as string) ||
      'unknown';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let title = 'Internal Server Error';
    let detail = 'An unexpected internal error occurred.';
    let invalidParams: Array<{ name: string; reason: string }> | undefined;

    if (exception instanceof BffDomainException) {
      status = exception.status;
      code = exception.code;
      title = exception.title;
      detail = exception.message;
      invalidParams = exception.invalidParams;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const resObj = exception.getResponse();
      if (typeof resObj === 'string') {
        detail = resObj;
      } else if (typeof resObj === 'object' && resObj !== null) {
        const raw = resObj as Record<string, unknown>;
        detail = (raw['message'] as string) || exception.message;
        if (Array.isArray(raw['message'])) {
          invalidParams = raw['message'].map((msg: unknown) => ({
            name: 'request',
            reason: String(msg),
          }));
          detail = 'Request validation failed.';
        }
      }
      code = this.httpStatusToCode(status);
      title = exception.name;
    } else {
      const err = exception instanceof Error ? exception : new Error(String(exception));
      this.logger.error(`Unhandled system exception: ${err.message}`, err.stack);
      detail = 'An unexpected internal server error occurred.';
    }

    const problem: ProblemDetailsResponse = {
      type: `https://api.skyra.dev/errors/${code}`,
      title,
      status,
      detail,
      instance: `${request.url}?req_id=${correlationId}`,
      code,
      ...(invalidParams && invalidParams.length > 0 ? { invalid_params: invalidParams } : {}),
    };

    response.status(status).header('content-type', 'application/problem+json').send(problem);
  }

  private httpStatusToCode(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'INVALID_ARGUMENT';
      case HttpStatus.UNAUTHORIZED:
        return 'UNAUTHORIZED';
      case HttpStatus.FORBIDDEN:
        return 'FORBIDDEN';
      case HttpStatus.NOT_FOUND:
        return 'NOT_FOUND';
      case HttpStatus.GATEWAY_TIMEOUT:
        return 'UPSTREAM_TIMEOUT';
      case HttpStatus.BAD_GATEWAY:
        return 'UPSTREAM_SERVICE_ERROR';
      case HttpStatus.SERVICE_UNAVAILABLE:
        return 'MEMBERSHIP_PROVIDER_UNAVAILABLE';
      default:
        return 'INTERNAL_ERROR';
    }
  }
}
