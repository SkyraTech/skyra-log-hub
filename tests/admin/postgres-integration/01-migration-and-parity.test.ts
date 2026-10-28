import { test, describe, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import { Client } from 'pg';
import { getTestClient } from './fixtures.js';

describe('PostgreSQL Integration: Migration & Schema Parity (Section 7 & 8)', () => {
  let client: Client;

  before(async () => {
    client = await getTestClient();
  });

  after(async () => {
    await client.end();
  });

  test('1. Database contains exactly 16 operational tables across baseline and ADMIN-002', async () => {
    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);

    const tables = res.rows.map((r) => r.table_name);
    assert.equal(tables.length, 16, `Expected 16 tables, found: ${tables.join(', ')}`);

    const expectedTables = [
      'admin_audit_events',
      'archive_segments',
      'deduplication_receipts',
      'ingestion_checkpoints',
      'ingestion_credentials',
      'invitations',
      'permissions',
      'project_memberships',
      'project_quotas',
      'projects',
      'role_assignments',
      'role_permissions',
      'roles',
      'tenant_memberships',
      'tenants',
      'users',
    ];

    for (const exp of expectedTables) {
      assert.ok(tables.includes(exp), `Expected table "${exp}" to exist in schema.`);
    }
  });

  test('2. Enum types exist and contain expected values', async () => {
    const res = await client.query(`
      SELECT t.typname, e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      WHERE t.typname IN ('UserStatus', 'MembershipStatus', 'TenantStatus', 'ProjectStatus')
      ORDER BY t.typname, e.enumsortorder;
    `);

    const enums: Record<string, string[]> = {};
    for (const row of res.rows) {
      if (!enums[row.typname]) enums[row.typname] = [];
      enums[row.typname].push(row.enumlabel);
    }

    assert.deepEqual(enums['UserStatus'], ['ACTIVE', 'SUSPENDED', 'DEACTIVATED']);
    assert.deepEqual(enums['MembershipStatus'], ['PENDING_INVITE', 'ACTIVE', 'SUSPENDED', 'REVOKED']);
    assert.deepEqual(enums['TenantStatus'], ['ACTIVE', 'SUSPENDED', 'DECOMMISSIONED']);
    assert.deepEqual(enums['ProjectStatus'], ['ACTIVE', 'SUSPENDED', 'ARCHIVED']);
  });

  test('3. Key constraints and unique indexes exist on IAM tables', async () => {
    const res = await client.query(`
      SELECT indexname, tablename
      FROM pg_indexes
      WHERE schemaname = 'public' AND indexname IN (
        'uq_users_issuer_subject',
        'uq_tenant_memberships_tenant_user',
        'uq_project_memberships_scope',
        'uq_role_assignments_scope',
        'roles_name_key',
        'permissions_code_key',
        'invitations_token_hash_key'
      );
    `);

    const indexes = res.rows.map((r) => r.indexname);
    assert.ok(indexes.includes('uq_users_issuer_subject'), 'uq_users_issuer_subject unique index missing');
    assert.ok(indexes.includes('uq_tenant_memberships_tenant_user'), 'uq_tenant_memberships_tenant_user missing');
    assert.ok(indexes.includes('uq_project_memberships_scope'), 'uq_project_memberships_scope missing');
    assert.ok(indexes.includes('uq_role_assignments_scope'), 'uq_role_assignments_scope missing');
    assert.ok(indexes.includes('roles_name_key'), 'roles_name_key missing');
    assert.ok(indexes.includes('permissions_code_key'), 'permissions_code_key missing');
    assert.ok(indexes.includes('invitations_token_hash_key'), 'invitations_token_hash_key missing');
  });

  test('4. Foreign keys enforce CASCADE on memberships and SET NULL on audit log actors', async () => {
    const res = await client.query(`
      SELECT 
        conname, 
        confdeltype,
        conrelid::regclass::text as table_name
      FROM pg_constraint 
      WHERE conname IN (
        'fk_tenant_memberships_tenant',
        'fk_project_memberships_tenant',
        'fk_project_memberships_project',
        'fk_admin_audit_events_tenant',
        'fk_admin_audit_events_actor'
      );
    `);

    const constraints = new Map(res.rows.map((r) => [r.conname, r.confdeltype]));
    // 'c' = CASCADE, 'n' = SET NULL
    assert.equal(constraints.get('fk_tenant_memberships_tenant'), 'c', 'fk_tenant_memberships_tenant must CASCADE');
    assert.equal(constraints.get('fk_project_memberships_tenant'), 'c', 'fk_project_memberships_tenant must CASCADE');
    assert.equal(constraints.get('fk_project_memberships_project'), 'c', 'fk_project_memberships_project must CASCADE');
    assert.equal(constraints.get('fk_admin_audit_events_tenant'), 'c', 'fk_admin_audit_events_tenant must CASCADE');
    assert.equal(constraints.get('fk_admin_audit_events_actor'), 'n', 'fk_admin_audit_events_actor must be SET NULL');
  });
});
