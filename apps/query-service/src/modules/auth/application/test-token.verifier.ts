import { Injectable } from '@nestjs/common';
import type { ITokenVerificationPort } from '../domain/token-verification.port.js';
import type { QueryPrincipal, QueryRole } from '../domain/principal.model.js';
import { UnauthorizedException } from '../../../common/errors/query.errors.js';
import { JwtVerificationService } from './jwt-verification.service.js';

@Injectable()
export class TestTokenVerifier implements ITokenVerificationPort {
  constructor(private readonly standardJwtVerifier: JwtVerificationService) {}

  public async verifyToken(rawToken: string): Promise<QueryPrincipal> {
    if (!rawToken || typeof rawToken !== 'string') {
      throw new UnauthorizedException('Authentication token is required.');
    }

    const trimmed = rawToken.trim();

    // 1. Support test token prefix: "test-token:<base64-json>"
    if (trimmed.startsWith('test-token:')) {
      const b64 = trimmed.substring('test-token:'.length);
      try {
        const payload = JSON.parse(Buffer.from(b64, 'base64url').toString('utf-8'));
        return {
          sub: String(payload.sub || 'test-user-001'),
          tenantId: String(payload.tenantId || payload.tenant_id || 'test-tenant'),
          authorizedProjects: Array.isArray(payload.authorizedProjects || payload.projects)
            ? (payload.authorizedProjects || payload.projects).map(String)
            : ['*'],
          allowedEnvironments: Array.isArray(payload.allowedEnvironments)
            ? payload.allowedEnvironments.map(String)
            : ['production', 'staging', 'development', 'test', 'local'],
          roles: Array.isArray(payload.roles)
            ? (payload.roles as QueryRole[])
            : ['viewer'],
          iss: String(payload.iss || 'https://auth.skyra.test'),
          aud: String(payload.aud || 'skyra-loghub-query'),
          exp: Number(payload.exp || Math.floor(Date.now() / 1000) + 3600),
          nbf: payload.nbf ? Number(payload.nbf) : undefined,
          iat: payload.iat ? Number(payload.iat) : undefined,
        };
      } catch {
        throw new UnauthorizedException('Invalid test-token base64 payload.');
      }
    }

    // 2. Delegate to standard JWT verification if standard token format
    return this.standardJwtVerifier.verifyToken(trimmed);
  }
}
