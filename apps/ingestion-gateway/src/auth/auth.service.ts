import { Injectable, Inject, HttpStatus, Logger } from '@nestjs/common';
import * as crypto from 'node:crypto';
import { CREDENTIAL_REPOSITORY, type ICredentialRepository } from '../metadata/repositories/credential.repository.interface.js';
import { TENANT_REPOSITORY, type ITenantRepository } from '../metadata/repositories/tenant.repository.interface.js';
import { GatewayException } from '../common/types/gateway-exception.js';
import { ErrorCode } from '../common/types/error-code.enum.js';
import type { AuthenticatedIdentity } from './auth.types.js';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(CREDENTIAL_REPOSITORY)
    private readonly credentialRepo: ICredentialRepository,
    @Inject(TENANT_REPOSITORY)
    private readonly tenantRepo: ITenantRepository,
  ) {}

  public hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  public async authenticate(rawToken: string): Promise<AuthenticatedIdentity> {
    if (!rawToken || typeof rawToken !== 'string' || rawToken.trim().length === 0) {
      throw new GatewayException(
        ErrorCode.UNAUTHORIZED,
        'Authorization Bearer token is missing or empty',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const keyHash = this.hashToken(rawToken.trim());
    const credential = await this.credentialRepo.findByKeyHash(keyHash);

    if (!credential) {
      this.logger.warn(`Authentication failed: invalid credential hash prefix ${keyHash.substring(0, 8)}...`);
      throw new GatewayException(
        ErrorCode.UNAUTHORIZED,
        'Invalid or unrecognized ingestion credential',
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (credential.isRevoked) {
      this.logger.warn(`Authentication failed: credential ID ${credential.id} is revoked`);
      throw new GatewayException(
        ErrorCode.UNAUTHORIZED,
        'Ingestion credential has been revoked',
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (new Date() > credential.expiresAt) {
      this.logger.warn(`Authentication failed: credential ID ${credential.id} expired at ${credential.expiresAt.toISOString()}`);
      throw new GatewayException(
        ErrorCode.UNAUTHORIZED,
        'Ingestion credential has expired',
        HttpStatus.UNAUTHORIZED,
      );
    }

    // Verify tenant status
    const tenant = await this.tenantRepo.findById(credential.tenantId);
    if (!tenant || tenant.status !== 'ACTIVE') {
      this.logger.warn(`Authorization rejected: tenant ${credential.tenantId} status is ${tenant?.status ?? 'NOT_FOUND'}`);
      throw new GatewayException(
        ErrorCode.PROJECT_ACCESS_DENIED,
        'Tenant account is not active or has been suspended',
        HttpStatus.FORBIDDEN,
      );
    }

    // Update last used asynchronously without blocking request pipeline
    void this.credentialRepo.updateLastUsed(credential.id, new Date()).catch((err: unknown) => {
      this.logger.error(`Failed to update credential lastUsedAt: ${String(err)}`);
    });

    return {
      credentialId: credential.id,
      tenantId: credential.tenantId,
      allowedProjects: [...credential.allowedProjects],
      allowedEnvironments: [...credential.allowedEnvironments],
      rateLimitPerMin: credential.rateLimitPerMin,
    };
  }
}
