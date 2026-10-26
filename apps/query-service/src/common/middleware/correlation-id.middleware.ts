import * as crypto from 'node:crypto';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { FastifyRequest, FastifyReply } from 'fastify';

export interface CorrelatedRequest extends FastifyRequest {
  correlationId: string;
  requestId: string;
}

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  public use(req: FastifyRequest['raw'], res: FastifyReply['raw'], next: () => void): void {
    const rawHeaders = req.headers;
    const existingCorrelation =
      (rawHeaders['x-correlation-id'] as string | undefined) ??
      (rawHeaders['x-request-id'] as string | undefined);

    const correlationId = existingCorrelation && existingCorrelation.trim().length > 0
      ? existingCorrelation.trim()
      : crypto.randomUUID();

    const requestId = crypto.randomUUID();

    // Attach to request headers
    req.headers['x-correlation-id'] = correlationId;
    req.headers['x-request-id'] = requestId;

    // Propagate onto response headers
    res.setHeader('x-correlation-id', correlationId);
    res.setHeader('x-request-id', requestId);

    next();
  }
}
