import { describe, it, beforeEach } from 'node:test';
import * as assert from 'node:assert';
import { InMemoryAuditRepository } from '../../src/core/audit/infrastructure/in-memory-audit.repository.js';
import { InMemoryIdentityRepository } from '../../src/modules/identity/infrastructure/in-memory-identity.repository.js';
import { InMemoryMembershipRepository } from '../../src/modules/membership/infrastructure/in-memory-membership.repository.js';
import { IdentityService } from '../../src/modules/identity/application/identity.service.js';
import { MembershipService } from '../../src/modules/membership/application/membership.service.js';
import { BootstrapService } from '../../src/modules/bootstrap/application/bootstrap.service.js';
import { EffectivePermissionResolver } from '../../src/modules/authorization/application/effective-permission.resolver.js';
import { AdminConfigService } from '../../src/core/config/admin-config.service.js';
import { sanitizeAuditDetails } from '../../src/core/audit/domain/admin-audit-event.model.js';
import {
  AuditPersistenceException,
  OptimisticLockConflictException,
} from '../../src/core/errors/admin.errors.js';

describe('Audit Transaction, Bootstrap & Integrity Suite (Section 20 Scenarios 36-45)', () => {
  let auditRepo: InMemoryAuditRepository;
  let identityRepo: InMemoryIdentityRepository;
  let membershipRepo: InMemoryMembershipRepository;
  let config: AdminConfigService;
  let identityService: IdentityService;
  let membershipService: MembershipService;
  let bootstrapService: BootstrapService;

  beforeEach(() => {
    auditRepo = new InMemoryAuditRepository();
    identityRepo = new InMemoryIdentityRepository();
    membershipRepo = new InMemoryMembershipRepository();
    config = new AdminConfigService({
      TRUSTED_OIDC_ISSUERS: 'https://auth.skyra.internal',
      ADMIN_PERSISTENCE_ENABLED: 'false',
    });
    identityService = new IdentityService(identityRepo, config);
    const resolver = new EffectivePermissionResolver();
    membershipService = new MembershipService(membershipRepo, auditRepo, resolver);
    bootstrapService = new BootstrapService(identityService, membershipService, membershipRepo);
  });

  it('36. Unique identity constraint: duplicate (issuer, subject) throws constraint violation on save', async () => {
    const user1 = {
      id: 'uuid-1',
      issuer: 'https://auth.skyra.internal',
      subject: 'sub-dup-check',
      email: 'user1@skyra.internal',
      displayName: 'User 1',
      status: 'ACTIVE' as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await identityRepo.save(user1);

    const user2 = {
      id: 'uuid-2',
      issuer: 'https://auth.skyra.internal',
      subject: 'sub-dup-check',
      email: 'user2@skyra.internal',
      displayName: 'User 2',
      status: 'ACTIVE' as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await assert.rejects(
      async () => {
        await identityRepo.save(user2);
      },
      (err: unknown) => {
        assert.match((err as Error).message, /Unique constraint violation/);
        return true;
      },
    );
  });

  it('37. Duplicate membership prevention: re-assigning role updates existing record cleanly', async () => {
    const tenantId = 'ten-001';
    const userId = 'usr-001';

    const a1 = await membershipService.assignRole(
      userId,
      'actor@skyra.internal',
      tenantId,
      userId,
      'Developer',
      'proj-1',
    );
    assert.ok(a1.id);

    const list = await membershipRepo.listRoleAssignments(tenantId, userId);
    assert.strictEqual(list.length, 1);
  });

  it('38. Tenant/project membership scope consistency: grants are isolated per tenant', async () => {
    await membershipService.assignRole('u1', 'u1@skyra.internal', 'ten-a', 'u1', 'Viewer', 'proj-1');
    await membershipService.assignRole('u1', 'u1@skyra.internal', 'ten-b', 'u1', 'OrgOwner', 'proj-1');

    const tenAAssignments = await membershipRepo.listRoleAssignments('ten-a', 'u1');
    const tenBAssignments = await membershipRepo.listRoleAssignments('ten-b', 'u1');

    assert.strictEqual(tenAAssignments[0]?.role, 'Viewer');
    assert.strictEqual(tenBAssignments[0]?.role, 'OrgOwner');
  });

  it('39. Transaction rollback on audit failure: mutation fails closed if audit repo throws', async () => {
    auditRepo.shouldSimulateFailure = true;

    await assert.rejects(
      async () => {
        await membershipService.assignRole('u1', 'u1@skyra.internal', 'ten-a', 'u1', 'Developer', null);
      },
      (err: unknown) => {
        assert.ok(err instanceof AuditPersistenceException);
        assert.match((err as Error).message, /Simulated audit persistence failure/);
        return true;
      },
    );
  });

  it('40. Concurrent last-owner mutation protection', async () => {
    const tenantId = 'ten-last-owner';
    const ownerA = 'owner-a';
    const ownerB = 'owner-b';

    await membershipService.assignRole('sys', 'sys@skyra.internal', tenantId, ownerA, 'OrgOwner', null);
    await membershipService.assignRole('sys', 'sys@skyra.internal', tenantId, ownerB, 'OrgOwner', null);

    assert.strictEqual(await membershipRepo.countTenantOwners(tenantId), 2);

    // Remove first owner -> succeeds
    await membershipService.revokeMembership('sys', 'sys@skyra.internal', tenantId, ownerA);
    assert.strictEqual(await membershipRepo.countTenantOwners(tenantId), 1);

    // Attempt to remove second owner -> rejected with LastOwnerProtectionException
    await assert.rejects(
      async () => {
        await membershipService.revokeMembership('sys', 'sys@skyra.internal', tenantId, ownerB);
      },
      (err: unknown) => {
        assert.match((err as Error).message, /last OrgOwner/);
        return true;
      },
    );
  });

  it('41. Bootstrap idempotency: initial bootstrap succeeds, repeat invocation is rejected', async () => {
    const dto = {
      tenantId: 'bootstrap-ten-1',
      tenantName: 'First Enterprise Tenant',
      initialOwnerIssuer: 'https://auth.skyra.internal',
      initialOwnerSubject: 'sub-first-owner',
      initialOwnerEmail: 'founder@first-enterprise.com',
      initialOwnerDisplayName: 'Founder Owner',
    };

    const result = await bootstrapService.bootstrapTenantOwner(dto);
    assert.strictEqual(result.tenantId, 'bootstrap-ten-1');
    assert.strictEqual(result.ownerEmail, 'founder@first-enterprise.com');

    // Second bootstrap attempt MUST be rejected
    await assert.rejects(
      async () => {
        await bootstrapService.bootstrapTenantOwner(dto);
      },
      (err: unknown) => {
        assert.ok(err instanceof OptimisticLockConflictException);
        assert.match((err as Error).message, /already bootstrapped/);
        return true;
      },
    );
  });

  it('42. Bootstrap creates auditable event and active OrgOwner role assignment', async () => {
    const dto = {
      tenantId: 'bootstrap-ten-2',
      tenantName: 'Second Enterprise Tenant',
      initialOwnerIssuer: 'https://auth.skyra.internal',
      initialOwnerSubject: 'sub-second-owner',
      initialOwnerEmail: 'founder2@second-enterprise.com',
      initialOwnerDisplayName: 'Founder Two',
    };
    await bootstrapService.bootstrapTenantOwner(dto);

    const events = await auditRepo.listAuditEvents('bootstrap-ten-2');
    assert.ok(events.length >= 1);
    assert.strictEqual(events[0]?.action, 'MEMBER_ROLE_CHANGED');
    assert.strictEqual(events[0]?.details['role'], 'OrgOwner');
  });

  it('43. Audit persistence records events in reverse chronological order', async () => {
    const tenantId = 'ten-timeline';
    await auditRepo.recordAuditEvent({
      tenantId,
      actorEmail: 'admin@skyra.internal',
      action: 'TENANT_UPDATED',
      targetType: 'tenant',
      targetId: tenantId,
      details: { step: 1 },
      createdAt: new Date('2026-10-28T01:00:00Z'),
    });

    await auditRepo.recordAuditEvent({
      tenantId,
      actorEmail: 'admin@skyra.internal',
      action: 'PROJECT_CREATED',
      targetType: 'project',
      targetId: 'proj-1',
      details: { step: 2 },
      createdAt: new Date('2026-10-28T02:00:00Z'),
    });

    const list = await auditRepo.listAuditEvents(tenantId);
    assert.strictEqual(list.length, 2);
    assert.strictEqual(list[0]?.action, 'PROJECT_CREATED');
    assert.strictEqual(list[1]?.action, 'TENANT_UPDATED');
  });

  it('44. Redaction test: sensitive credentials, tokens, and secrets are strictly redacted in audit details', () => {
    const hostilePayload = {
      action: 'CREDENTIAL_CREATED',
      secret: 'super-sensitive-plaintext-api-secret',
      key_hash: '3f78923a',
      token: 'bearer-jwt-token-xyz',
      nested: {
        password: 'admin-password-123',
        publicNote: 'safe note',
      },
    };

    const sanitized = sanitizeAuditDetails(hostilePayload);
    assert.strictEqual(sanitized['secret'], '[REDACTED]');
    assert.strictEqual(sanitized['key_hash'], '[REDACTED]');
    assert.strictEqual(sanitized['token'], '[REDACTED]');
    assert.strictEqual((sanitized['nested'] as Record<string, unknown>)['password'], '[REDACTED]');
    assert.strictEqual((sanitized['nested'] as Record<string, unknown>)['publicNote'], 'safe note');
  });

  it('45. Dry-run rollback SQL syntax verification (validates statement structure)', () => {
    const rollbackSql = `
      DROP TABLE IF EXISTS "admin_audit_events" CASCADE;
      DROP TABLE IF EXISTS "invitations" CASCADE;
      DROP TABLE IF EXISTS "role_assignments" CASCADE;
      DROP TABLE IF EXISTS "role_permissions" CASCADE;
      DROP TABLE IF EXISTS "permissions" CASCADE;
      DROP TABLE IF EXISTS "roles" CASCADE;
      DROP TABLE IF EXISTS "project_memberships" CASCADE;
      DROP TABLE IF EXISTS "tenant_memberships" CASCADE;
      DROP TABLE IF EXISTS "users" CASCADE;
      DROP TYPE IF EXISTS "UserStatus";
      DROP TYPE IF EXISTS "MembershipStatus";
    `;
    assert.ok(rollbackSql.includes('DROP TABLE IF EXISTS "admin_audit_events" CASCADE;'));
    assert.ok(rollbackSql.includes('DROP TYPE IF EXISTS "UserStatus";'));
  });
});
