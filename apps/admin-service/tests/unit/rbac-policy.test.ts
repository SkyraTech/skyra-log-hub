import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { EffectivePermissionResolver } from '../../src/modules/authorization/application/effective-permission.resolver.js';
import { RBAC_ROLE_CAPABILITIES } from '../../src/modules/authorization/domain/rbac-matrix.js';
import {
  InsufficientPermissionException,
  SelfEscalationException,
  CrossTenantViolationException,
  LastOwnerProtectionException,
} from '../../src/core/errors/admin.errors.js';

describe('RBAC & Capability Policy Engine Suite (Section 20 Scenarios 16-25)', () => {
  const resolver = new EffectivePermissionResolver();
  const tenantId = '00000000-0000-0000-0000-000000000001';
  const foreignTenantId = '99999999-9999-9999-9999-999999999999';
  const userId = 'user-test-id';

  it('16. OrgOwner possesses all 20 capabilities including tenant.update, quotas.manage, retention.manage', () => {
    const caps = resolver.resolveEffectiveCapabilities(
      [{ tenantId, userId, role: 'OrgOwner' }],
      tenantId,
    );
    assert.strictEqual(caps.size, 20);
    assert.ok(caps.has('tenant.update'));
    assert.ok(caps.has('quotas.manage'));
    assert.ok(caps.has('retention.manage'));
    assert.ok(caps.has('tenant.members.manage'));
    assert.ok(caps.has('audit.read'));
  });

  it('17. OrgAdmin possesses operational admin rights but lacks quotas.manage and retention.manage', () => {
    const caps = resolver.resolveEffectiveCapabilities(
      [{ tenantId, userId, role: 'OrgAdmin' }],
      tenantId,
    );
    assert.ok(caps.has('tenant.members.manage'));
    assert.ok(caps.has('projects.create'));
    assert.ok(caps.has('ingestion.credentials.create'));
    assert.ok(caps.has('ingestion.credentials.revoke'));
    assert.ok(!caps.has('quotas.manage'));
    assert.ok(!caps.has('retention.manage'));
  });

  it('18. ProjectAdmin is restricted to project boundaries and lacks tenant-level capabilities', () => {
    const caps = resolver.resolveEffectiveCapabilities(
      [{ tenantId, userId, role: 'ProjectAdmin', projectId: 'project-auth' }],
      tenantId,
      'project-auth',
    );
    assert.ok(caps.has('projects.update'));
    assert.ok(caps.has('projects.members.manage'));
    assert.ok(caps.has('ingestion.credentials.create'));
    assert.ok(!caps.has('tenant.update'));
    assert.ok(!caps.has('tenant.members.manage'));
    assert.ok(!caps.has('projects.create'));
  });

  it('19. Developer is restricted to reading and log querying with staging credentials', () => {
    const caps = resolver.resolveEffectiveCapabilities(
      [{ tenantId, userId, role: 'Developer', projectId: 'project-auth' }],
      tenantId,
      'project-auth',
    );
    assert.ok(caps.has('logs.search'));
    assert.ok(caps.has('logs.analytics'));
    assert.ok(caps.has('ingestion.credentials.read'));
    assert.ok(caps.has('ingestion.credentials.rotate'));
    assert.ok(!caps.has('ingestion.credentials.create'));
    assert.ok(!caps.has('ingestion.credentials.revoke'));
    assert.ok(!caps.has('projects.update'));
  });

  it('20. Viewer has strictly read-only search and analytics capabilities', () => {
    const caps = resolver.resolveEffectiveCapabilities(
      [{ tenantId, userId, role: 'Viewer' }],
      tenantId,
    );
    assert.strictEqual(caps.size, 3);
    assert.ok(caps.has('projects.read'));
    assert.ok(caps.has('logs.search'));
    assert.ok(caps.has('logs.analytics'));
    assert.ok(!caps.has('ingestion.credentials.read'));
    assert.ok(!caps.has('audit.read'));
  });

  it('21. Self-escalation prevention: actor cannot grant a role containing permissions they lack', () => {
    // ProjectAdmin attempting to grant OrgAdmin
    const projectAdminCaps = new Set(RBAC_ROLE_CAPABILITIES['ProjectAdmin']);

    assert.throws(
      () => {
        resolver.validateRoleAssignmentGrant(tenantId, projectAdminCaps, tenantId, 'OrgAdmin');
      },
      (err: unknown) => {
        assert.ok(err instanceof InsufficientPermissionException || err instanceof SelfEscalationException);
        return true;
      },
    );
  });

  it('22. Last-owner protection: cannot remove or downgrade the last OrgOwner', () => {
    assert.throws(
      () => {
        resolver.assertNotLastOwner(1, 'OrgOwner');
      },
      (err: unknown) => {
        assert.ok(err instanceof LastOwnerProtectionException);
        assert.match((err as Error).message, /last OrgOwner/);
        return true;
      },
    );

    // When 2 owners exist, it does not throw
    assert.doesNotThrow(() => {
      resolver.assertNotLastOwner(2, 'OrgOwner');
    });
  });

  it('23. Cross-tenant role assignment is strictly rejected', () => {
    const ownerCaps = new Set(RBAC_ROLE_CAPABILITIES['OrgOwner']);
    assert.throws(
      () => {
        resolver.validateRoleAssignmentGrant(tenantId, ownerCaps, foreignTenantId, 'Developer');
      },
      (err: unknown) => {
        assert.ok(err instanceof CrossTenantViolationException);
        assert.match((err as Error).message, /Cross-tenant role assignment rejected/);
        return true;
      },
    );
  });

  it('24. Multiple roles union permissions correctly', () => {
    const caps = resolver.resolveEffectiveCapabilities(
      [
        { tenantId, userId, role: 'Viewer' },
        { tenantId, userId, role: 'Developer', projectId: 'project-auth' },
      ],
      tenantId,
      'project-auth',
    );

    assert.ok(caps.has('logs.search'));
    assert.ok(caps.has('ingestion.credentials.rotate'));
  });

  it('25. Deny-by-default fallback: empty assignments produce 0 capabilities and assertHasCapability throws', () => {
    const caps = resolver.resolveEffectiveCapabilities([], tenantId);
    assert.strictEqual(caps.size, 0);

    assert.throws(
      () => {
        resolver.assertHasCapability(caps, 'logs.search', 'query logs');
      },
      (err: unknown) => {
        assert.ok(err instanceof InsufficientPermissionException);
        return true;
      },
    );
  });
});
