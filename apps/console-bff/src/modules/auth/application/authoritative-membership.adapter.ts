import { Injectable, Logger } from '@nestjs/common';
import type { IMembershipProvider } from '../domain/membership-provider.port.js';
import type { WorkspaceMembership } from '../domain/session.model.js';
import { BffConfigService } from '../../../config/bff-config.service.js';
import { MembershipProviderUnavailableException } from '../../../common/errors/bff.errors.js';

@Injectable()
export class AuthoritativeMembershipAdapter implements IMembershipProvider {
  private readonly logger = new Logger(AuthoritativeMembershipAdapter.name);

  constructor(private readonly config: BffConfigService) {}

  public async resolveMemberships(userId: string, email: string): Promise<WorkspaceMembership[]> {
    if (!this.config.useAuthoritativeMembership) {
      if (this.config.isProduction) {
        this.logger.error(
          `Production access denied: authoritative membership backend disabled under Gate A safety gate for user ${userId}.`,
        );
        throw new MembershipProviderUnavailableException(
          'Authoritative enterprise membership directory is pending Gate B activation.',
        );
      }
      // When disabled in non-production, fail closed if caller expects authoritative provider
      throw new MembershipProviderUnavailableException(
        'Authoritative enterprise membership backend is disabled (BFF_USE_AUTHORITATIVE_MEMBERSHIP=false).',
      );
    }

    // When Gate B is approved and activated:
    // Fetches authoritative tenant & project grants from admin-service using service assertion
    try {
      // Prepared integration hook for admin-service API
      const adminUrl = this.config.adminServiceUrl;
      this.logger.log(`Querying authoritative admin service at ${adminUrl} for user ${userId}...`);
      throw new MembershipProviderUnavailableException(
        'Authoritative membership persistence pending Gate B database migration execution.',
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to resolve authoritative memberships from admin-service: ${msg}`);
      throw new MembershipProviderUnavailableException(
        `Authoritative membership directory query failed: ${msg}`,
      );
    }
  }
}
