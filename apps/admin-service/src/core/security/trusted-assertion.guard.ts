import * as crypto from 'node:crypto';
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { AdminConfigService } from '../config/admin-config.service.js';
import { InvalidIdentityAssertionException } from '../errors/admin.errors.js';

export interface TrustedPrincipal {
  sub: string;
  email: string;
  tenantId: string;
  roles: string[];
  capabilities?: string[];
  iss: string;
  aud: string;
  exp: number;
}

declare module 'fastify' {
  interface FastifyRequest {
    principal?: TrustedPrincipal;
  }
}

@Injectable()
export class TrustedAssertionGuard implements CanActivate {
  constructor(private readonly config: AdminConfigService) {}

  public canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const authHeader = request.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new InvalidIdentityAssertionException(
        'Missing or malformed Authorization header. Expected Bearer token.',
      );
    }

    const token = authHeader.substring(7).trim();
    const principal = this.verifyAssertionToken(token);
    request.principal = principal;
    return true;
  }

  public verifyAssertionToken(token: string): TrustedPrincipal {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new InvalidIdentityAssertionException('Malformed JWT assertion structure.');
    }

    const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];

    let header: { alg: string; typ?: string };
    let payload: Record<string, unknown>;

    try {
      header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'));
      payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    } catch {
      throw new InvalidIdentityAssertionException('Failed to decode JWT assertion JSON.');
    }

    // Algorithm allowlist: strictly HS256
    if (header.alg !== 'HS256') {
      throw new InvalidIdentityAssertionException(
        `Unsupported JWT signing algorithm "${header.alg}". Expected HS256.`,
      );
    }

    // Verify cryptographic signature
    const dataToVerify = `${headerB64}.${payloadB64}`;
    const expectedSig = crypto
      .createHmac('sha256', this.config.internalJwtSecret)
      .update(dataToVerify)
      .digest('base64url');

    const expectedBuf = Buffer.from(expectedSig, 'utf8');
    const actualBuf = Buffer.from(signatureB64, 'utf8');

    if (expectedBuf.length !== actualBuf.length || !crypto.timingSafeEqual(expectedBuf, actualBuf)) {
      throw new InvalidIdentityAssertionException('Cryptographic signature verification failed.');
    }

    // Issuer verification
    const iss = typeof payload['iss'] === 'string' ? payload['iss'] : '';
    if (iss !== this.config.internalJwtIssuer) {
      throw new InvalidIdentityAssertionException(
        `Invalid token issuer "${iss}". Expected "${this.config.internalJwtIssuer}".`,
      );
    }

    // Audience verification
    const aud = typeof payload['aud'] === 'string' ? payload['aud'] : '';
    if (aud !== this.config.internalJwtAudience) {
      throw new InvalidIdentityAssertionException(
        `Invalid token audience "${aud}". Expected "${this.config.internalJwtAudience}".`,
      );
    }

    // Expiration check (with 2s clock skew grace)
    const nowSec = Math.floor(Date.now() / 1000);
    const exp = typeof payload['exp'] === 'number' ? payload['exp'] : 0;
    if (exp < nowSec - 2) {
      throw new InvalidIdentityAssertionException('Token assertion has expired.');
    }

    // Extract fields
    const sub = typeof payload['sub'] === 'string' ? payload['sub'] : '';
    const email = typeof payload['email'] === 'string' ? payload['email'] : '';
    const tenantId = typeof payload['tenant_id'] === 'string' ? payload['tenant_id'] : '';
    const roles = Array.isArray(payload['roles']) ? (payload['roles'] as string[]) : [];
    const capabilities = Array.isArray(payload['capabilities']) ? (payload['capabilities'] as string[]) : undefined;

    if (!sub || !tenantId) {
      throw new InvalidIdentityAssertionException(
        'Token assertion payload missing mandatory sub or tenant_id claims.',
      );
    }

    return {
      sub,
      email,
      tenantId,
      roles,
      capabilities,
      iss,
      aud,
      exp,
    };
  }
}
