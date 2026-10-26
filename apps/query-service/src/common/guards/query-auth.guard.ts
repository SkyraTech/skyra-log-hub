import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  Inject,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import {
  TOKEN_VERIFICATION_PORT,
  type ITokenVerificationPort,
} from '../../modules/auth/domain/token-verification.port.js';
import type { QueryPrincipal } from '../../modules/auth/domain/principal.model.js';
import { UnauthorizedException } from '../errors/query.errors.js';

export interface AuthenticatedFastifyRequest extends FastifyRequest {
  principal: QueryPrincipal;
}

@Injectable()
export class QueryAuthGuard implements CanActivate {
  constructor(
    @Inject(TOKEN_VERIFICATION_PORT)
    private readonly tokenVerifier: ITokenVerificationPort,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedFastifyRequest>();
    const authHeader = request.headers['authorization'];

    if (!authHeader || typeof authHeader !== 'string') {
      throw new UnauthorizedException('Authorization header is required.');
    }

    const [scheme, token] = authHeader.trim().split(/\s+/);
    if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) {
      throw new UnauthorizedException('Authorization header must use Bearer scheme ("Bearer <token>").');
    }

    const principal = await this.tokenVerifier.verifyToken(token);
    request.principal = principal;

    return true;
  }
}
