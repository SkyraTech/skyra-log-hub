import { describe, it, beforeEach } from 'node:test';
import * as assert from 'node:assert';
import { MembershipService } from '../../src/modules/membership/application/membership.service.js';
import { InMemoryMembershipRepository } from '../../src/modules/membership/infrastructure/in-memory-membership.repository.js';
import { InMemoryAuditRepository } from '../../src/core/audit/infrastructure/in-memory-audit.repository.js';
import { EffectivePermissionResolver } from '../../src/modules/authorization/application/effective-permission.resolver.js';
import {
  TenantMembershipNotFoundException,
  LastOwnerProtectionException,
} from '../../src/core/errors/admin.errors.js';

describe('MembershipService Security & Lifecycle Suite (Section 20 Scenarios 6-15)', () => {
  let repo: InMemoryMembershipRepository;
  let auditRepo: InMemoryAuditRepository;
  let resolver: EffectivePermissionResolver;
  let service: MembershipService;

  const tenantId = '00000000-0000-0000-0000-000000000001';
  const ownerUserId = '11111111-1111-1111-1111-111111111111';
  const devUserId = '22222222-2222-2222-2222-222222222222';

  beforeEach(async () => {
    repo = new InMemoryMembershipRepository();
    auditRepo = new InMemoryAuditRepository();
    resolver = new EffectivePermissionResolver();
    service = new MembershipService(repo, auditRepo, resolver);

    // Seed active owner
    await service.assignRole(ownerUserId, 'owner@skyra.internal', tenantId, ownerUserId, 'OrgOwner', null);
  });

  it('6. Active tenant membership resolves with roles', async () => {
    const resolved = await service.resolveUserMemberships(tenantId, ownerUserId);
    assert.strictEqual(resolved.status, 'ACTIVE');
    assert.ok(resolved.tenantRoles.includes('OrgOwner'));
  });

  it('7. Active project membership resolves with scoped roles', async () => {
    await service.assignRole(
      ownerUserId,
      'owner@skyra.internal',
      tenantId,
      devUserId,
      'Developer',
      'auth-service',
    );

    const resolved = await service.resolveUserMemberships(tenantId, devUserId);
    assert.strictEqual(resolved.status, 'ACTIVE');
    const projectGrant = resolved.projectGrants.find((p) => p.projectId === 'auth-service');
    assert.ok(projectGrant);
    assert.ok(projectGrant.roles.includes('Developer'));
  });

  it('8. Unauthorized project is not in user project grants', async () => {
    await service.assignRole(
      ownerUserId,
      'owner@skyra.internal',
      tenantId,
      devUserId,
      'Developer',
      'allowed-project',
    );

    const resolved = await service.resolveUserMemberships(tenantId, devUserId);
    const forbidden = resolved.projectGrants.find((p) => p.projectId === 'billing-api');
    assert.strictEqual(forbidden, undefined);
  });

  it('9. Cross-tenant project lookup fails closed', async () => {
    const foreignTenantId = '99999999-9999-9999-9999-999999999999';
    await assert.rejects(
      async () => {
        await service.resolveUserMemberships(foreignTenantId, devUserId);
      },
      (err: unknown) => {
        assert.ok(err instanceof TenantMembershipNotFoundException);
        return true;
      },
    );
  });

  it('10. Revoked membership denies access immediately', async () => {
    await service.assignRole(
      ownerUserId,
      'owner@skyra.internal',
      tenantId,
      devUserId,
      'Developer',
      'project-alpha',
    );

    // Confirm active before revocation
    let resolved = await service.resolveUserMemberships(tenantId, devUserId);
    assert.strictEqual(resolved.status, 'ACTIVE');

    // Revoke
    await service.revokeMembership(ownerUserId, 'owner@skyra.internal', tenantId, devUserId);

    // Confirm rejected immediately
    await assert.rejects(
      async () => {
        await service.resolveUserMemberships(tenantId, devUserId);
      },
      (err: unknown) => {
        assert.ok(err instanceof TenantMembershipNotFoundException);
        assert.match((err as Error).message, /active membership/);
        return true;
      },
    );
  });

  it('11. Suspended tenant membership denies access', async () => {
    const tm = await repo.findTenantMembership(tenantId, ownerUserId);
    assert.ok(tm);
    tm.status = 'SUSPENDED';
    await repo.saveTenantMembership(tm);

    await assert.rejects(
      async () => {
        await service.resolveUserMemberships(tenantId, ownerUserId);
      },
      (err: unknown) => {
        assert.ok(err instanceof TenantMembershipNotFoundException);
        return true;
      },
    );
  });

  it('12. Disabled project membership marks project grant status non-active', async () => {
    await service.assignRole(
      ownerUserId,
      'owner@skyra.internal',
      tenantId,
      devUserId,
      'Developer',
      'project-gamma',
    );

    const pm = await repo.findProjectMembership(tenantId, 'project-gamma', devUserId);
    assert.ok(pm);
    pm.status = 'REVOKED';
    await repo.saveProjectMembership(pm);

    const resolved = await service.resolveUserMemberships(tenantId, devUserId);
    const grant = resolved.projectGrants.find((p) => p.projectId === 'project-gamma');
    assert.ok(grant);
    assert.strictEqual(grant.status, 'REVOKED');
  });

  it('13. Missing user membership in tenant fails closed', async () => {
    const nonMemberId = '77777777-7777-7777-7777-777777777777';
    await assert.rejects(
      async () => {
        await service.resolveUserMemberships(tenantId, nonMemberId);
      },
      (err: unknown) => {
        assert.ok(err instanceof TenantMembershipNotFoundException);
        return true;
      },
    );
  });

  it('14. Revocation of OrgOwner fails if user is the sole owner (Last Owner Protection)', async () => {
    // There is only 1 OrgOwner seeded in beforeEach
    assert.strictEqual(await repo.countTenantOwners(tenantId), 1);

    await assert.rejects(
      async () => {
        await service.revokeMembership(ownerUserId, 'owner@skyra.internal', tenantId, ownerUserId);
      },
      (err: unknown) => {
        assert.ok(err instanceof LastOwnerProtectionException);
        assert.match((err as Error).message, /last OrgOwner/);
        return true;
      },
    );
  });

  it('15. Revocation of OrgOwner succeeds when multiple owners exist', async () => {
    const secondOwnerId = '33333333-3333-3333-3333-333333333333';
    await service.assignRole(
      ownerUserId,
      'owner@skyra.internal',
      tenantId,
      secondOwnerId,
      'OrgOwner',
      null,
    );

    assert.strictEqual(await repo.countTenantOwners(tenantId), 2);

    // Now removing the second owner succeeds cleanly
    await service.revokeMembership(ownerUserId, 'owner@skyra.internal', tenantId, secondOwnerId);
    assert.strictEqual(await repo.countTenantOwners(tenantId), 1);
  });
});
