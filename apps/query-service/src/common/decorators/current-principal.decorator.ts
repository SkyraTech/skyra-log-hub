import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { QueryPrincipal } from '../../modules/auth/domain/principal.model.js';
import type { AuthenticatedFastifyRequest } from '../guards/query-auth.guard.js';

export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): QueryPrincipal => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedFastifyRequest>();
    return request.principal;
  },
);
