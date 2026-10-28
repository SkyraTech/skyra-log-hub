import { test, describe, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import { Client } from 'pg';
import {
  getTestClient,
  setupSyntheticFixtures,
  cleanupSyntheticFixtures,
  STANDARD_ROLES,
  STANDARD_PERMISSIONS,
  type SyntheticFixtureData,
} from './fixtures.js';

describe('PostgreSQL Integration: RBAC & Capability Persistence (Section 11)', () => {
  let client: Client;
  let fixtures: SyntheticFixtureData;

  before(async () => {
    client = await getTestClient();
    fixtures = await setupSyntheticFixtures(client);
  });

  after(async () => {
    await cleanupSyntheticFixtures(client, fixtures);
    await client.end();
  });

  test('1. All 5 standard roles exist in roles table with unique names', async () => {
    const res = await client.query(`SELECT name, is_system FROM roles ORDER BY name`);
    const names = res.rows.map((r) => r.name);

    for (const r of STANDARD_ROLES) {
      assert.ok(names.includes(r.name), `Missing role: ${r.name}`);
    }
  });

  test('2. All 22 approved capabilities exist in permissions table', async () => {
    const res = await client.query(`SELECT code FROM permissions ORDER BY code`);
    const codes = res.rows.map((r) => r.code);

    assert.equal(codes.length, 22, `Expected 22 capabilities, found: ${codes.length}`);
    for (const p of STANDARD_PERMISSIONS) {
      assert.ok(codes.includes(p), `Missing permission code: ${p}`);
    }
  });

  test('3. OrgOwner has all 22 capabilities mapped in role_permissions', async () => {
    const res = await client.query(`
      SELECT p.code 
      FROM role_permissions rp
      JOIN permissions p ON rp.permission_id = p.id
      JOIN roles r ON rp.role_id = r.id
      WHERE r.name = 'OrgOwner'
      ORDER BY p.code;
    `);

    assert.equal(res.rows.length, 22, 'OrgOwner must have all 22 capabilities');
  });

  test('4. Assigning tenant-wide role creates valid role_assignment record', async () => {
    const res = await client.query(
      `INSERT INTO role_assignments (tenant_id, user_id, role_id, project_id)
       VALUES ($1, $2, $3, NULL)
       RETURNING id, tenant_id, user_id, role_id, project_id`,
      [fixtures.tenantAId, fixtures.userAId, fixtures.adminRoleId]
    );

    assert.ok(res.rows[0].id);
    assert.equal(res.rows[0].project_id, null);
    assert.equal(res.rows[0].tenant_id, fixtures.tenantAId);
  });

  test('5. Assigning project-scoped role creates valid role_assignment record', async () => {
    const res = await client.query(
      `INSERT INTO role_assignments (tenant_id, user_id, role_id, project_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, tenant_id, user_id, role_id, project_id`,
      [fixtures.tenantAId, fixtures.userAId, fixtures.adminRoleId, fixtures.projectAId]
    );

    assert.ok(res.rows[0].id);
    assert.equal(res.rows[0].project_id, fixtures.projectAId);
  });

  test('6. Duplicate assignment of same role in same scope throws 23505 unique violation', async () => {
    // Attempt duplicate insert of tenant-wide role (project_id IS NULL)
    await assert.rejects(
      async () => {
        await client.query(
          `INSERT INTO role_assignments (tenant_id, user_id, role_id, project_id)
           VALUES ($1, $2, $3, NULL)`,
          [fixtures.tenantAId, fixtures.userAId, fixtures.adminRoleId]
        );
      },
      (err: any) => {
        assert.equal(err.code, '23505', 'Duplicate role assignment in same scope must throw 23505');
        assert.equal(err.constraint, 'uq_role_assignments_scope');
        return true;
      }
    );
  });
});
