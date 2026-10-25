import { Injectable, Inject, HttpStatus } from '@nestjs/common';
import { TENANT_REPOSITORY, type ITenantRepository } from '../metadata/repositories/tenant.repository.interface.js';
import { GatewayException } from '../common/types/gateway-exception.js';
import { ErrorCode } from '../common/types/error-code.enum.js';
import type { TenantEntity } from '../metadata/entities/metadata.entities.js';

@Injectable()
export class TenantService {
  constructor(
    @Inject(TENANT_REPOSITORY)
    private readonly tenantRepo: ITenantRepository,
  ) {}

  public async getActiveTenant(tenantId: string): Promise<TenantEntity> {
    const tenant = await this.tenantRepo.findById(tenantId);
    if (!tenant) {
      throw new GatewayException(
        ErrorCode.PROJECT_ACCESS_DENIED,
        `Tenant with ID "${tenantId}" was not found`,
        HttpStatus.FORBIDDEN,
      );
    }

    if (tenant.status !== 'ACTIVE') {
      throw new GatewayException(
        ErrorCode.PROJECT_ACCESS_DENIED,
        `Tenant "${tenant.name}" (${tenant.code}) is ${tenant.status}`,
        HttpStatus.FORBIDDEN,
      );
    }

    return tenant;
  }
}
