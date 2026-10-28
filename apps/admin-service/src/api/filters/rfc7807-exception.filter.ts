import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AdminException, type Rfc7807ProblemDetails } from '../../core/errors/admin.errors.js';

@Catch()
export class Rfc7807ExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(Rfc7807ExceptionFilter.name);

  public catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    const instance = request.url;

    if (exception instanceof AdminException) {
      const problem = exception.toProblemDetails(instance);
      this.logger.warn(`AdminException [${problem.status}]: ${problem.title} - ${problem.detail}`);
      response
        .status(problem.status)
        .header('content-type', 'application/problem+json')
        .send(problem);
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
      const detail = typeof res === 'string' ? res : (res as Record<string, unknown>)['message'] ?? exception.message;

      const problem: Rfc7807ProblemDetails = {
        type: 'https://skyra.io/errors/admin/http-error',
        title: exception.name,
        status,
        detail: Array.isArray(detail) ? detail.join('; ') : String(detail),
        instance,
      };

      response
        .status(status)
        .header('content-type', 'application/problem+json')
        .send(problem);
      return;
    }

    const err = exception instanceof Error ? exception : new Error(String(exception));
    this.logger.error(`Unhandled internal error: ${err.message}`, err.stack);

    const internalProblem: Rfc7807ProblemDetails = {
      type: 'https://skyra.io/errors/admin/internal-server-error',
      title: 'Internal Server Error',
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      detail: 'An unexpected internal error occurred.',
      code: 'INTERNAL_SERVER_ERROR',
      instance,
    };

    response
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .header('content-type', 'application/problem+json')
      .send(internalProblem);
  }
}
