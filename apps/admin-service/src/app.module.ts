import { Module } from '@nestjs/common';
import { AdminConfigService } from './core/config/admin-config.service.js';
import { TrustedAssertionGuard } from './core/security/trusted-assertion.guard.js';
import { AUDIT_PERSISTENCE_PORT } from './core/audit/domain/audit-persistence.port.js';
import { InMemoryAuditRepository } from './core/audit/infrastructure/in-memory-audit.repository.js';
import { PrismaAuditRepository } from './core/audit/infrastructure/prisma-audit.repository.js';
import { IDENTITY_REPOSITORY_PORT } from './modules/identity/domain/identity.repository.port.js';
import { InMemoryIdentityRepository } from './modules/identity/infrastructure/in-memory-identity.repository.js';
import { PrismaIdentityRepository } from './modules/identity/infrastructure/prisma-identity.repository.js';
import { IdentityService } from './modules/identity/application/identity.service.js';
import { EffectivePermissionResolver } from './modules/authorization/application/effective-permission.resolver.js';
import { MEMBERSHIP_REPOSITORY_PORT } from './modules/membership/domain/membership.repository.port.js';
import { InMemoryMembershipRepository } from './modules/membership/infrastructure/in-memory-membership.repository.js';
import { PrismaMembershipRepository } from './modules/membership/infrastructure/prisma-membership.repository.js';
import { MembershipService } from './modules/membership/application/membership.service.js';
import { BootstrapService } from './modules/bootstrap/application/bootstrap.service.js';
import { MetaController } from './api/controllers/meta.controller.js';

@Module({
  controllers: [MetaController],
  providers: [
    AdminConfigService,
    TrustedAssertionGuard,
    EffectivePermissionResolver,

    // Audit persistence provider
    {
      provide: AUDIT_PERSISTENCE_PORT,
      useFactory: (config: AdminConfigService) => {
        return config.persistenceEnabled
          ? new PrismaAuditRepository(config)
          : new InMemoryAuditRepository();
      },
      inject: [AdminConfigService],
    },

    // Identity repository provider
    {
      provide: IDENTITY_REPOSITORY_PORT,
      useFactory: (config: AdminConfigService) => {
        return config.persistenceEnabled
          ? new PrismaIdentityRepository(config)
          : new InMemoryIdentityRepository();
      },
      inject: [AdminConfigService],
    },
    IdentityService,

    // Membership repository provider
    {
      provide: MEMBERSHIP_REPOSITORY_PORT,
      useFactory: (config: AdminConfigService) => {
        return config.persistenceEnabled
          ? new PrismaMembershipRepository(config)
          : new InMemoryMembershipRepository();
      },
      inject: [AdminConfigService],
    },
    MembershipService,

    BootstrapService,
  ],
  exports: [
    AdminConfigService,
    TrustedAssertionGuard,
    IdentityService,
    MembershipService,
    EffectivePermissionResolver,
    BootstrapService,
    AUDIT_PERSISTENCE_PORT,
    IDENTITY_REPOSITORY_PORT,
    MEMBERSHIP_REPOSITORY_PORT,
  ],
})
export class AppModule {}
