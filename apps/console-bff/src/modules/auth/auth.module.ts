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

@Module({
  controllers: [AuthController],
  providers: [
    BffConfigService,
    SessionStoreService,
    CsrfService,
    OidcService,
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
    MembershipService,
    QueryTokenService,
    SessionAuthGuard,
    CsrfGuard,
  ],
})
export class AuthModule {}
