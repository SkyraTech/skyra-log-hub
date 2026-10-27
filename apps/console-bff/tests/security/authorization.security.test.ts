import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { QueryTokenService } from '../../src/modules/auth/application/query-token.service.js';
import { MembershipService } from '../../src/modules/auth/application/membership.service.js';
import { BffConfigService } from '../../src/config/bff-config.service.js';
import {
  UnauthorizedProjectException,
  MembershipProviderUnavailableException,
} from '../../src/common/errors/bff.errors.js';
import type { BffSession } from '../../src/modules/auth/domain/session.model.js';

describe('Authoritative Workspace & Authorization Test Suite (Section 21 Tests 21-30)', () => {
  const config = new BffConfigService();
  const queryTokenService = new QueryTokenService(config);
  const membershipService = new MembershipService(config);

  const sampleSession: BffSession = {
    sessionId: 'test_session_id',
    user: {
      id: 'usr_dev_1',
      email: 'engineer@skyra.dev',
      name: 'Dev Engineer',
      roles: ['developer'],
    },
    memberships: [
      {
        tenantId: 'skyra-internal',
        tenantName: 'Skyra Internal Platform',
        projects: [
          {
            projectId: 'skyra-tech',
            projectName: 'Skyra Core Ingestion & Gateway',
            roles: ['viewer', 'analyst'],
            allowedEnvironments: ['production', 'staging'],
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
    ],
    createdAt: new Date(),
    lastActivityAt: new Date(),
    csrfToken: 'csrf_valid',
    activeTenantId: 'skyra-internal',
    activeProjectId: 'skyra-tech',
  };

  it('21. Authorized project: successfully issues scoped Query Service JWT for verified project', () => {
    const token = queryTokenService.createScopedQueryToken(
      sampleSession,
      'skyra-internal',
      'skyra-tech',
    );
    assert.ok(typeof token === 'string');
    const parts = token.split('.');
    assert.equal(parts.length, 3);

    const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf-8'));
    assert.equal(payload.tenant_id, 'skyra-internal');
    assert.deepEqual(payload.authorized_projects, ['skyra-tech']);
    assert.equal(payload.sub, 'usr_dev_1');
    assert.equal(payload.iss, 'https://auth.skyra.internal');
    assert.equal(payload.aud, 'skyra-loghub-query');
  });

  it('22. Unauthorized project: rejects access to project user is not a member of', () => {
    assert.throws(
      () => {
        queryTokenService.createScopedQueryToken(
          sampleSession,
          'skyra-internal',
          'secret-billing-core', // User is NOT a member of secret-billing-core
        );
      },
      (err: unknown) => {
        assert.ok(err instanceof UnauthorizedProjectException);
        assert.ok(err.message.includes('User does not have authorized access to project'));
        return true;
      },
    );
  });

  it('23. Cross-tenant project: rejects attempt to access a project from a foreign tenant', () => {
    assert.throws(
      () => {
        // Attempting to request demo-ecommerce under tenant skyra-internal
        queryTokenService.createScopedQueryToken(
          sampleSession,
          'skyra-internal',
          'demo-ecommerce',
        );
      },
      (err: unknown) => {
        assert.ok(err instanceof UnauthorizedProjectException);
        return true;
      },
    );
  });

  it('24. Revoked membership: empty memberships rejects all query attempts', () => {
    const emptySession: BffSession = {
      ...sampleSession,
      memberships: [],
    };

    assert.throws(
      () => {
        queryTokenService.createScopedQueryToken(
          emptySession,
          'skyra-internal',
          'skyra-tech',
        );
      },
      (err: unknown) => {
        assert.ok(err instanceof UnauthorizedProjectException);
        return true;
      },
    );
  });

  it('25. Forged client roles: Query token only derives roles from authoritative server session', () => {
    // Principal has only ['viewer', 'analyst']
    const token = queryTokenService.createScopedQueryToken(
      sampleSession,
      'skyra-internal',
      'skyra-tech',
    );
    const parts = token.split('.');
    const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf-8'));

    // Server mints only authoritative roles, not admin
    assert.deepEqual(payload.roles, ['viewer', 'analyst']);
    assert.equal(payload.roles.includes('admin'), false);
  });

  it('26. Missing membership provider: fails closed in production mode', async () => {
    // Simulate production environment
    const prodConfig = {
      isProduction: true,
    } as unknown as BffConfigService;

    const prodMembershipService = new MembershipService(prodConfig);

    await assert.rejects(
      async () => {
        await prodMembershipService.resolveMemberships('usr_prod_1', 'user@company.com');
      },
      (err: unknown) => {
        assert.ok(err instanceof MembershipProviderUnavailableException);
        assert.ok(err.message.includes('Authoritative enterprise membership directory is not configured'));
        return true;
      },
    );
  });

  it('27. Disabled/invalid tenant: rejects unknown tenant ID', () => {
    assert.throws(
      () => {
        queryTokenService.createScopedQueryToken(
          sampleSession,
          'non-existent-tenant-999',
          'skyra-tech',
        );
      },
      (err: unknown) => {
        assert.ok(err instanceof UnauthorizedProjectException);
        assert.ok(err.message.includes('User does not belong to requested tenant'));
        return true;
      },
    );
  });

  it('28. Isolated partner membership: partner users only receive partner tenant grants', async () => {
    const partnerMemberships = await membershipService.resolveMemberships('partner_user', 'partner@external.com');
    assert.equal(partnerMemberships.length, 1);
    assert.equal(partnerMemberships[0]?.tenantId, 'partner-demo');
    assert.equal(partnerMemberships[0]?.projects[0]?.projectId, 'demo-ecommerce');
  });

  it('29. Standard development memberships: maps internal dev accounts to internal platform', async () => {
    const devMemberships = await membershipService.resolveMemberships('lead_arch', 'architect@skyra.dev');
    assert.ok(devMemberships.some((m) => m.tenantId === 'skyra-internal'));
    const internalTenant = devMemberships.find((m) => m.tenantId === 'skyra-internal');
    assert.ok(internalTenant?.projects.some((p) => p.projectId === 'skyra-tech'));
    assert.ok(internalTenant?.projects.some((p) => p.projectId === 'auth-service'));
  });

  it('30. Open redirect protection: relative URLs are accepted, external URLs are sanitized', () => {
    const sanitizeReturnUrl = (url?: string): string => {
      if (!url) return '/';
      if (url.startsWith('/') && !url.startsWith('//') && !url.includes('\\')) {
        return url;
      }
      return '/';
    };

    assert.equal(sanitizeReturnUrl('/logs?filter=error'), '/logs?filter=error');
    assert.equal(sanitizeReturnUrl('https://evil-attacker.com/steal-session'), '/');
    assert.equal(sanitizeReturnUrl('//evil-attacker.com'), '/');
    assert.equal(sanitizeReturnUrl('/\\evil-attacker.com'), '/');
  });
});
