import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedFastifyRequest } from './auth.guard.js';
import type { AuthenticatedIdentity } from './auth.types.js';

export const CurrentIdentity = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedIdentity | undefined => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedFastifyRequest>();
    return request.skyraIdentity;
  },
);
