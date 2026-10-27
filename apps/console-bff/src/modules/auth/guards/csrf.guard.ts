import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { CsrfService } from '../application/csrf.service.js';
import { CsrfValidationException } from '../../../common/errors/bff.errors.js';

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly csrfService: CsrfService) {}

  public canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const method = request.method.toUpperCase();

    // Safe idempotent methods do not require CSRF token
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      return true;
    }

    // Origin/Referer check
    const origin = request.headers['origin'] as string | undefined;
    const referer = request.headers['referer'] as string | undefined;
    this.csrfService.validateOrigin(origin, referer);

    // CSRF token check
    const providedToken =
      (request.headers['x-csrf-token'] as string | undefined) ||
      (request.headers['x-xsrf-token'] as string | undefined);

    const session = request.session;
    if (!session || !this.csrfService.validateToken(providedToken, session.csrfToken)) {
      throw new CsrfValidationException(
        'Invalid or missing anti-CSRF token in state-changing request.',
      );
    }

    return true;
  }
}
