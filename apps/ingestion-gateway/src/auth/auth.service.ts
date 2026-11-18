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
    if (!rawToken || typeof rawToken !== 'string' || rawToken.trim().length === 0 || rawToken.length > 4096 || /[\u0000-\u001f\u007f]/.test(rawToken)) {
      throw new GatewayException(
        ErrorCode.UNAUTHORIZED,
        'Authorization Bearer token is missing or empty',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const token=rawToken.trim();
    if(token.startsWith('skyra_live_')&&!/^skyra_live_[a-f0-9]{64}$/.test(token))throw new GatewayException(ErrorCode.UNAUTHORIZED,'Invalid ingestion credential',HttpStatus.UNAUTHORIZED);
    const keyHash = this.hashToken(token);
    let credential: Awaited<ReturnType<ICredentialRepository['findByKeyHash']>>;
    try{credential=await this.credentialRepo.findByKeyHash(keyHash);}catch{throw new GatewayException(ErrorCode.STORAGE_NOT_READY,'Credential verification unavailable',HttpStatus.SERVICE_UNAVAILABLE,{retryable:true});}
    if(credential&&(!/^[a-f0-9]{64}$/.test(credential.keyHash)||!crypto.timingSafeEqual(Buffer.from(keyHash,'hex'),Buffer.from(credential.keyHash,'hex'))))credential=null;

    if (!credential) {
      this.logger.warn('Authentication failed: invalid ingestion credential');
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

    if (!Number.isFinite(credential.expiresAt.getTime()) || Date.now() >= credential.expiresAt.getTime()) {
      this.logger.warn('Authentication failed: ingestion credential expired');
      throw new GatewayException(
        ErrorCode.UNAUTHORIZED,
        'Ingestion credential has expired',
        HttpStatus.UNAUTHORIZED,
      );
    }

    // Verify tenant status
    let tenant: Awaited<ReturnType<ITenantRepository['findById']>>;
    try{tenant=await this.tenantRepo.findById(credential.tenantId);}catch{throw new GatewayException(ErrorCode.STORAGE_NOT_READY,'Credential authorization unavailable',HttpStatus.SERVICE_UNAVAILABLE,{retryable:true});}
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
      this.logger.error('Credential authentication timestamp update failed');
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
