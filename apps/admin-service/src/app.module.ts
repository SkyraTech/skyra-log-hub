import 'reflect-metadata';
import {DashboardPreferencesController} from './api/controllers/dashboard-preferences.controller.js';
import {DashboardPreferencesService} from './modules/dashboard-preferences/dashboard-preferences.service.js';
import {SavedSearchesService} from './modules/saved-searches/saved-searches.service.js';
import {SavedSearchesController} from './api/controllers/saved-searches.controller.js';
import {AuditHistoryService} from './core/audit/application/audit-history.service.js';
import {AuditHistoryController} from './api/controllers/audit-history.controller.js';
import {QuotasService} from './modules/projects/quotas.service.js';
import {QuotasController} from './api/controllers/quotas.controller.js';
import { CredentialsController } from './api/controllers/credentials.controller.js';
import { CredentialsService } from './modules/credentials/credentials.service.js';
import { ProjectsController } from './api/controllers/projects.controller.js';
import { ProjectsService } from './modules/projects/projects.service.js';
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
import { OrganizationController } from './api/controllers/organization.controller.js';
import { OrganizationService } from './modules/organization/organization.service.js';
import { AdminDatabaseLifecycle } from './core/database/admin-prisma.js';
import { MembersManagementService } from './modules/membership/members-management.service.js';
import { MembersController } from './api/controllers/members.controller.js';

@Module({
  controllers: [DashboardPreferencesController,SavedSearchesController, AuditHistoryController, QuotasController, MetaController, OrganizationController, MembersController, ProjectsController, CredentialsController],
  providers: [
    SavedSearchesService,DashboardPreferencesService,
    AdminConfigService,
    TrustedAssertionGuard,
    EffectivePermissionResolver,
    OrganizationService,
    MembersManagementService,
    ProjectsService,
    QuotasService,
    AuditHistoryService,
    CredentialsService,
    AdminDatabaseLifecycle,

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
