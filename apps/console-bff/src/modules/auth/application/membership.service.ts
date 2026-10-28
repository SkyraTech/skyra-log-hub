import { Injectable, Logger, Optional } from '@nestjs/common';
import type { IMembershipProvider } from '../domain/membership-provider.port.js';
import type { WorkspaceMembership } from '../domain/session.model.js';
import { BffConfigService } from '../../../config/bff-config.service.js';
import { MembershipProviderUnavailableException } from '../../../common/errors/bff.errors.js';
import { AuthoritativeMembershipAdapter } from './authoritative-membership.adapter.js';

@Injectable()
export class MembershipService implements IMembershipProvider {
  private readonly logger = new Logger(MembershipService.name);

  constructor(
    private readonly config: BffConfigService,
    @Optional() private readonly authoritativeAdapter?: AuthoritativeMembershipAdapter,
  ) {}

  public async resolveMemberships(userId: string, email: string): Promise<WorkspaceMembership[]> {
    if (this.config.useAuthoritativeMembership && this.authoritativeAdapter) {
      return this.authoritativeAdapter.resolveMemberships(userId, email);
    }

    if (this.config.isProduction) {
      // In production mode, we must fail closed unless an enterprise directory or IAM provider is connected
      this.logger.error(
        `Production workspace authorization failed: No authoritative enterprise membership provider configured. Access blocked for user ${userId}.`,
      );
      throw new MembershipProviderUnavailableException(
        'Authoritative enterprise membership directory is not configured. Production access is blocked.',
      );
    }

    // Explicit isolated development fixture
    return this.getDevelopmentMemberships(userId, email);
  }

  private getDevelopmentMemberships(userId: string, email: string): WorkspaceMembership[] {
    const isPartner = email.includes('partner') || userId.includes('partner');

    if (isPartner) {
      return [
        {
          tenantId: 'partner-demo',
          tenantName: 'Partner Demonstration Tenant',
          projects: [
            {
              projectId: 'demo-ecommerce',
              projectName: 'Demo E-Commerce Storefront',
              roles: ['viewer', 'analyst'],
              allowedEnvironments: ['staging', 'development'],
            },
          ],
        },
      ];
    }

    return [
      {
        tenantId: 'skyra-internal',
        tenantName: 'Skyra Internal Platform',
        projects: [
          {
            projectId: 'skyra-tech',
            projectName: 'Skyra Core Ingestion & Gateway',
            roles: ['admin', 'analyst', 'viewer'],
            allowedEnvironments: ['production', 'staging', 'development', 'local'],
          },
          {
            projectId: 'auth-service',
            projectName: 'Authentication & Identity Service',
            roles: ['analyst', 'viewer'],
            allowedEnvironments: ['production', 'staging'],
          },
          {
            projectId: 'billing-api',
            projectName: 'Billing & Subscriptions API',
            roles: ['viewer'],
            allowedEnvironments: ['production'],
          },
        ],
      },
      {
        tenantId: 'partner-demo',
        tenantName: 'Partner Demonstration Tenant',
        projects: [
          {
            projectId: 'demo-ecommerce',
            projectName: 'Demo E-Commerce Storefront',
            roles: ['viewer'],
            allowedEnvironments: ['staging'],
          },
        ],
      },
    ];
  }
}
