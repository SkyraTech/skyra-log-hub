import { Injectable, type CanActivate, type ExecutionContext, HttpStatus } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { AuthService } from './auth.service.js';
import { GatewayException } from '../common/types/gateway-exception.js';
import { ErrorCode } from '../common/types/error-code.enum.js';
import type { AuthenticatedIdentity } from './auth.types.js';

export interface AuthenticatedFastifyRequest extends FastifyRequest {
  skyraIdentity?: AuthenticatedIdentity;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedFastifyRequest>();
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      throw new GatewayException(
        ErrorCode.UNAUTHORIZED,
        'Authorization header with Bearer token is required',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
    if (!match || !match[1]) {
      throw new GatewayException(
        ErrorCode.UNAUTHORIZED,
        'Malformed Authorization header. Format: Bearer <token>',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const token = match[1].trim();
    const identity = await this.authService.authenticate(token);

    request.skyraIdentity = identity;
    return true;
  }
}
