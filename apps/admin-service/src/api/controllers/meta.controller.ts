import { Controller, Get } from '@nestjs/common';
import { AdminConfigService } from '../../core/config/admin-config.service.js';
import { ALL_CAPABILITIES } from '../../modules/authorization/domain/permission.model.js';
import { SYSTEM_ROLES } from '../../modules/authorization/domain/role.model.js';
import { RBAC_ROLE_CAPABILITIES } from '../../modules/authorization/domain/rbac-matrix.js';

@Controller()
export class MetaController {
  constructor(private readonly config: AdminConfigService) {}

  @Get('health/liveness')
  public getLiveness() {
    return {
      status: 'UP',
      service: 'skyra-admin-service',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('health/readiness')
  public getReadiness() {
    return {
      status: 'UP',
      service: 'skyra-admin-service',
      persistenceReady: this.config.persistenceEnabled,
      gateMode: this.config.persistenceEnabled ? 'GATE_B_ACTIVE' : 'GATE_A_STAGED',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('admin/v1/meta')
  public getMetadata() {
    return {
      service: 'skyra-admin-service',
      version: '0.1.0',
      apiContractVersion: '3.1.0',
      supportedRoles: Object.keys(SYSTEM_ROLES),
      supportedCapabilities: ALL_CAPABILITIES,
      roleCapabilities: RBAC_ROLE_CAPABILITIES,
      trustedIssuers: this.config.trustedIssuers,
      persistenceMode: this.config.persistenceEnabled ? 'POSTGRES_PRISMA' : 'IN_MEMORY_STAGED',
    };
  }
}
