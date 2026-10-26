import {
  Injectable,
  type NestInterceptor,
  type ExecutionContext,
  type CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { QueryAuditService } from '../../modules/audit/query-audit.service.js';
import type { AuthenticatedFastifyRequest } from '../guards/query-auth.guard.js';

@Injectable()
export class AuditLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditLoggingInterceptor.name);

  constructor(private readonly auditService: QueryAuditService) {}

  public intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const startTimeNs = process.hrtime.bigint();
    const httpCtx = context.switchToHttp();
    const request = httpCtx.getRequest<AuthenticatedFastifyRequest>();
    const reply = httpCtx.getResponse<FastifyReply>();

    const correlationId =
      (request.headers['x-correlation-id'] as string) ||
      (request.headers['x-request-id'] as string) ||
      'unknown';

    return next.handle().pipe(
      tap({
        next: () => {
          const durationNs = process.hrtime.bigint() - startTimeNs;
          const durationMs = Number(durationNs) / 1_000_000;

          try {
            reply.header('x-response-time-ms', Math.round(durationMs));
          } catch {
            // Header may have already been flushed
          }

          if (request.url?.startsWith('/query/')) {
            this.auditService.recordSecurityEvent({
              eventType: 'DISCOVERY_COMPLETED',
              principalId: request.principal?.sub,
              tenantId: request.principal?.tenantId,
              correlationId,
              durationMs,
              detail: `HTTP ${request.method} ${request.url} completed successfully in ${durationMs.toFixed(2)}ms`,
            });
          }
        },
        error: (err: unknown) => {
          const durationNs = process.hrtime.bigint() - startTimeNs;
          const durationMs = Number(durationNs) / 1_000_000;

          try {
            reply.header('x-response-time-ms', Math.round(durationMs));
          } catch {
            // Header may have already been flushed
          }

          const errMsg = err instanceof Error ? err.message : String(err);
          this.logger.debug(
            `HTTP ${request.method} ${request.url} failed after ${durationMs.toFixed(2)}ms: ${errMsg}`,
          );
        },
      }),
    );
  }
}
