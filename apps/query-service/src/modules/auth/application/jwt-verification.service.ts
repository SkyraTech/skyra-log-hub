import * as crypto from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import type { ITokenVerificationPort } from '../domain/token-verification.port.js';
import type { QueryPrincipal, QueryRole } from '../domain/principal.model.js';
import { UnauthorizedException } from '../../../common/errors/query.errors.js';
import { QueryConfigService } from '../../../config/query-config.service.js';

@Injectable()
export class JwtVerificationService implements ITokenVerificationPort {
  private readonly logger = new Logger(JwtVerificationService.name);

  constructor(private readonly config: QueryConfigService) {}

  public async verifyToken(rawToken: string): Promise<QueryPrincipal> {
    if (!rawToken || typeof rawToken !== 'string') {
      throw new UnauthorizedException('Authentication token is required.');
    }

    const parts = rawToken.trim().split('.');
    if (parts.length !== 3) {
      throw new UnauthorizedException('Malformed JWT structure. Expected 3 base64url segments.');
    }

    const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];

    let header: Record<string, unknown>;
    let payload: Record<string, unknown>;

    try {
      header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf-8'));
      payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));
    } catch {
      throw new UnauthorizedException('Failed to parse JWT header or payload JSON.');
    }

    const alg = String(header['alg'] ?? '');
    if (!['HS256', 'RS256', 'EdDSA', 'Ed25519'].includes(alg)) {
      throw new UnauthorizedException(`Unsupported or insecure JWT algorithm: "${alg}".`);
    }

    const dataToVerify = `${headerB64}.${payloadB64}`;
    const signature = Buffer.from(signatureB64, 'base64url');

    const isValid = this.verifySignature(alg, dataToVerify, signature);
    if (!isValid) {
      throw new UnauthorizedException('Invalid JWT cryptographic signature.');
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const clockSkewSec = 5;

    const exp = Number(payload['exp']);
    if (isNaN(exp) || nowSec > exp + clockSkewSec) {
      throw new UnauthorizedException('JWT token has expired.');
    }

    if (payload['nbf'] !== undefined) {
      const nbf = Number(payload['nbf']);
      if (!isNaN(nbf) && nowSec < nbf - clockSkewSec) {
        throw new UnauthorizedException('JWT token is not yet valid (nbf constraint).');
      }
    }

    const iss = String(payload['iss'] ?? '');
    if (this.config.jwtIssuer && iss !== this.config.jwtIssuer) {
      throw new UnauthorizedException(`Invalid JWT issuer: expected "${this.config.jwtIssuer}", received "${iss}".`);
    }

    const aud = payload['aud'];
    const audMatches = Array.isArray(aud)
      ? aud.includes(this.config.jwtAudience)
      : aud === this.config.jwtAudience;
    if (this.config.jwtAudience && !audMatches) {
      throw new UnauthorizedException(`Invalid JWT audience: expected "${this.config.jwtAudience}".`);
    }

    const sub = String(payload['sub'] ?? '');
    if (!sub) {
      throw new UnauthorizedException('Missing required "sub" (subject) claim in token.');
    }

    const tenantId = String(payload['tenant_id'] ?? payload['tenantId'] ?? '');
    if (!tenantId) {
      throw new UnauthorizedException('Missing required "tenant_id" claim in token.');
    }

    const authorizedProjects: string[] = Array.isArray(payload['authorized_projects'])
      ? payload['authorized_projects'].map(String)
      : Array.isArray(payload['allowed_projects'])
        ? payload['allowed_projects'].map(String)
        : Array.isArray(payload['projects'])
          ? payload['projects'].map(String)
          : [];

    const allowedEnvironments: string[] = Array.isArray(payload['allowed_environments'])
      ? payload['allowed_environments'].map(String)
      : ['production', 'staging', 'development', 'test', 'local'];

    const roles: QueryRole[] = Array.isArray(payload['roles'])
      ? (payload['roles'].filter((r): r is QueryRole => ['viewer', 'analyst', 'admin'].includes(String(r))) as QueryRole[])
      : ['viewer'];

    return {
      sub,
      tenantId,
      authorizedProjects,
      allowedEnvironments,
      roles,
      iss,
      aud: String(payload['aud'] ?? ''),
      exp,
      nbf: payload['nbf'] !== undefined ? Number(payload['nbf']) : undefined,
      iat: payload['iat'] !== undefined ? Number(payload['iat']) : undefined,
    };
  }

  private verifySignature(alg: string, data: string, signature: Buffer): boolean {
    const key = this.config.jwtSecretOrPublicKey;

    try {
      if (alg === 'HS256') {
        const expectedHmac = crypto.createHmac('sha256', key).update(data).digest();
        if (expectedHmac.length !== signature.length) return false;
        return crypto.timingSafeEqual(expectedHmac, signature);
      }

      if (alg === 'RS256') {
        const verify = crypto.createVerify('RSA-SHA256');
        verify.update(data);
        return verify.verify(key, signature);
      }

      if (alg === 'EdDSA' || alg === 'Ed25519') {
        return crypto.verify(null, Buffer.from(data), key, signature);
      }

      return false;
    } catch (err) {
      this.logger.warn(`Signature verification exception for alg ${alg}: ${String(err)}`);
      return false;
    }
  }
}
