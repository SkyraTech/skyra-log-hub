import {AuditExportController} from './api/audit-export.controller.js';
import {UsageHistoryController} from './api/usage-history.controller.js';
import {DashboardPreferencesController} from './api/dashboard-preferences.controller.js';
import {SavedSearchesController} from './api/saved-searches.controller.js';
import {AuditHistoryController} from './api/audit-history.controller.js';
import {QuotasController} from './api/quotas.controller.js';
import { CredentialsController } from './api/credentials.controller.js';
import { ProjectsController } from './api/projects.controller.js';
import { Module } from '@nestjs/common';
import { AuthController } from './api/auth.controller.js';
import { SessionStoreService } from './application/session-store.service.js';
import { CsrfService } from './application/csrf.service.js';
import { OidcService } from './application/oidc.service.js';
import { MembershipService } from './application/membership.service.js';
import { QueryTokenService } from './application/query-token.service.js';
import { SessionAuthGuard } from './guards/session-auth.guard.js';
import { CsrfGuard } from './guards/csrf.guard.js';
import { BffConfigService } from '../../config/bff-config.service.js';
import { AuthoritativeMembershipAdapter } from './application/authoritative-membership.adapter.js';
import { AdminClientService } from './application/admin-client.service.js';
import { OrganizationController } from './api/organization.controller.js';
import { MembersController } from './api/members.controller.js';

@Module({
  controllers: [AuditExportController,UsageHistoryController,SavedSearchesController,DashboardPreferencesController, AuditHistoryController, QuotasController, AuthController, OrganizationController, MembersController, ProjectsController, CredentialsController],
  providers: [
    BffConfigService,
    AdminClientService,
    SessionStoreService,
    CsrfService,
    OidcService,
    AuthoritativeMembershipAdapter,
    MembershipService,
    QueryTokenService,
    SessionAuthGuard,
    CsrfGuard,
  ],
  exports: [
    BffConfigService,
    SessionStoreService,
    CsrfService,
    OidcService,
    AuthoritativeMembershipAdapter,
    MembershipService,
    QueryTokenService,
    SessionAuthGuard,
    CsrfGuard,
  ],
})
export class AuthModule {}
