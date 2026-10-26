import { Module, Global } from '@nestjs/common';
import { TOKEN_VERIFICATION_PORT } from './domain/token-verification.port.js';
import { PROJECT_AUTHORIZATION_PORT } from './authorization/project-authorization.port.js';
import { JwtVerificationService } from './application/jwt-verification.service.js';
import { TestTokenVerifier } from './application/test-token.verifier.js';
import { ProjectAuthorizationService } from './authorization/project-authorization.service.js';
import { QueryAuthGuard } from '../../common/guards/query-auth.guard.js';
import { QueryConfigService } from '../../config/query-config.service.js';

@Global()
@Module({
  providers: [
    JwtVerificationService,
    TestTokenVerifier,
    ProjectAuthorizationService,
    QueryAuthGuard,
    {
      provide: TOKEN_VERIFICATION_PORT,
      useFactory: (config: QueryConfigService, jwtVerifier: JwtVerificationService, testVerifier: TestTokenVerifier) => {
        if (config.authMode === 'test') {
          return testVerifier;
        }
        return jwtVerifier;
      },
      inject: [QueryConfigService, JwtVerificationService, TestTokenVerifier],
    },
    {
      provide: PROJECT_AUTHORIZATION_PORT,
      useClass: ProjectAuthorizationService,
    },
  ],
  exports: [
    TOKEN_VERIFICATION_PORT,
    PROJECT_AUTHORIZATION_PORT,
    QueryAuthGuard,
    JwtVerificationService,
    ProjectAuthorizationService,
  ],
})
export class AuthModule {}
