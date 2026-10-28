import { test, describe, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import { Client } from 'pg';
import {
  getTestClient,
  setupSyntheticFixtures,
  cleanupSyntheticFixtures,
  type SyntheticFixtureData,
} from './fixtures.js';

describe('PostgreSQL Integration: Atomic Administrative Auditing (Section 14)', () => {
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

  test('Scenario A: Authorized mutation and audit write commit atomically together', async () => {
    await client.query('BEGIN');

    // Mutation: Insert project membership
    const pmRes = await client.query(
      `INSERT INTO project_memberships (tenant_id, project_id, user_id, status)
       VALUES ($1, $2, $3, 'ACTIVE') RETURNING id`,
      [fixtures.tenantAId, fixtures.projectAId, fixtures.userAId]
    );
    const pmId = pmRes.rows[0].id;

    // Audit write in same transaction
    const auditRes = await client.query(
      `INSERT INTO admin_audit_events (
         tenant_id, actor_email, action, target_type, target_id, details
       ) VALUES ($1, 'auditor@skyra.internal', 'PROJECT_MEMBER_ADDED', 'project_membership', $2, '{"status":"ACTIVE"}')
       RETURNING id`,
      [fixtures.tenantAId, pmId]
    );
    const auditId = auditRes.rows[0].id;

    await client.query('COMMIT');

    // Verify both exist
    const pmCheck = await client.query(`SELECT id FROM project_memberships WHERE id = $1`, [pmId]);
    assert.equal(pmCheck.rows.length, 1, 'Project membership must be committed');

    const auditCheck = await client.query(`SELECT id, action FROM admin_audit_events WHERE id = $1`, [auditId]);
    assert.equal(auditCheck.rows.length, 1, 'Audit record must be committed');
  });

  test('Scenario B: Audit write failure forces transaction rollback — mutation is NOT persisted', async () => {
    // We attempt to assign a role to User B, but force the audit write to fail (e.g., null required actor_email)
    let assignedRoleId: string | null = null;

    try {
      await client.query('BEGIN');

      // 1. Mutation: Assign role
      const raRes = await client.query(
        `INSERT INTO role_assignments (tenant_id, user_id, role_id, project_id)
         VALUES ($1, $2, $3, NULL) RETURNING id`,
        [fixtures.tenantAId, fixtures.userBId, fixtures.adminRoleId]
      );
      assignedRoleId = raRes.rows[0].id;

      // 2. Forced Audit Failure: Attempt to insert audit record violating NOT NULL on actor_email
      await client.query(
        `INSERT INTO admin_audit_events (
           tenant_id, actor_email, action, target_type, target_id
         ) VALUES ($1, NULL, 'ROLE_ASSIGNED', 'role_assignment', $2)`,
        [fixtures.tenantAId, assignedRoleId]
      );

      await client.query('COMMIT');
      assert.fail('Should not reach here: audit write failure must throw');
    } catch (err: any) {
      await client.query('ROLLBACK');
      assert.equal(err.code, '23502', 'Must fail with NOT NULL violation on actor_email');
    }

    // 3. CRITICAL INVARIANT: The mutation must NOT exist in the database!
    if (assignedRoleId) {
      const checkMutation = await client.query(`SELECT id FROM role_assignments WHERE id = $1`, [assignedRoleId]);
      assert.equal(
        checkMutation.rows.length,
        0,
        'CRITICAL: Role assignment must be rolled back if audit persistence fails!'
      );
    }
  });

  test('Scenario C: Mutation failure ensures NO audit event is committed', async () => {
    const preCountRes = await client.query(`SELECT count(*)::int as c FROM admin_audit_events WHERE tenant_id = $1`, [
      fixtures.tenantAId,
    ]);
    const preCount = preCountRes.rows[0].c;

    try {
      await client.query('BEGIN');

      // Force mutation failure: Foreign key violation
      await client.query(
        `INSERT INTO tenant_memberships (tenant_id, user_id, status)
         VALUES ('00000000-0000-0000-0000-000000000099', $1, 'ACTIVE')`,
        [fixtures.userAId]
      );

      // Hypothetical audit write
      await client.query(
        `INSERT INTO admin_audit_events (
           tenant_id, actor_email, action, target_type, target_id
         ) VALUES ($1, 'admin@skyra.internal', 'MEMBER_ADDED', 'membership', $2)`,
        [fixtures.tenantAId, fixtures.userAId]
      );

      await client.query('COMMIT');
    } catch {
      await client.query('ROLLBACK');
    }

    const postCountRes = await client.query(
      `SELECT count(*)::int as c FROM admin_audit_events WHERE tenant_id = $1`,
      [fixtures.tenantAId]
    );
    assert.equal(postCountRes.rows[0].c, preCount, 'Audit event count must be unchanged after mutation rollback');
  });
});
