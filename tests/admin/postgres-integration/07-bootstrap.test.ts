import { test, describe, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import { Client, Pool } from 'pg';
import {
  getTestClient,
  getTestPool,
  seedStandardRolesAndPermissions,
} from './fixtures.js';

describe('PostgreSQL Integration: First-Owner Bootstrap & Idempotency (Section 15)', () => {
  let mainClient: Client;
  let pool: Pool;
  let ownerRoleId: string;

  before(async () => {
    mainClient = await getTestClient();
    pool = getTestPool();
    const roleMap = await seedStandardRolesAndPermissions(mainClient);
    ownerRoleId = roleMap.get('OrgOwner')!;
  });

  after(async () => {
    await pool.end();
    await mainClient.end();
  });

  async function executeBootstrap(
    client: Client,
    tenantId: string,
    email: string,
    subject: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await client.query('BEGIN');

      // 1. Lock tenant row to serialize bootstrap
      await client.query('SELECT id FROM tenants WHERE id = $1 FOR UPDATE', [tenantId]);

      // 2. Check if active owner already exists
      const existingRes = await client.query(
        `SELECT COUNT(*)::int as c 
         FROM role_assignments ra
         JOIN tenant_memberships tm ON ra.tenant_id = tm.tenant_id AND ra.user_id = tm.user_id
         WHERE ra.tenant_id = $1 AND ra.role_id = $2 AND tm.status = 'ACTIVE'`,
        [tenantId, ownerRoleId]
      );

      if (existingRes.rows[0].c > 0) {
        await client.query('ROLLBACK');
        return { success: false, error: 'BOOTSTRAP_REJECTED: Tenant already has an active OrgOwner.' };
      }

      // 3. Create or resolve user
      const uRes = await client.query(
        `INSERT INTO users (issuer, subject, email, display_name, status)
         VALUES ('https://accounts.google.com', $1, $2, 'Bootstrap Founder', 'ACTIVE')
         ON CONFLICT (issuer, subject) DO UPDATE SET updated_at = NOW()
         RETURNING id`,
        [subject, email]
      );
      const userId = uRes.rows[0].id;

      // 4. Create tenant membership
      await client.query(
        `INSERT INTO tenant_memberships (tenant_id, user_id, status)
         VALUES ($1, $2, 'ACTIVE')
         ON CONFLICT (tenant_id, user_id) DO UPDATE SET status = 'ACTIVE'`,
        [tenantId, userId]
      );

      // 5. Assign OrgOwner role
      await client.query(
        `INSERT INTO role_assignments (tenant_id, user_id, role_id, project_id)
         VALUES ($1, $2, $3, NULL)`,
        [tenantId, userId, ownerRoleId]
      );

      // 6. Record audit event
      await client.query(
        `INSERT INTO admin_audit_events (
           tenant_id, actor_email, action, target_type, target_id, details
         ) VALUES ($1, $2, 'BOOTSTRAP_EXECUTED', 'tenant', $3, '{"role":"OrgOwner"}')`,
        [tenantId, email, tenantId]
      );

      await client.query('COMMIT');
      return { success: true };
    } catch (err: any) {
      await client.query('ROLLBACK').catch(() => {});
      return { success: false, error: err.message };
    }
  }

  test('1. First-owner bootstrap succeeds on empty tenant and records audit', async () => {
    const tRes = await mainClient.query(
      `INSERT INTO tenants (code, name, status, updated_at) 
       VALUES ('bootstrap-fresh-t', 'Fresh Tenant', 'ACTIVE', NOW()) RETURNING id`
    );
    const tenantId = tRes.rows[0].id;

    try {
      const res = await executeBootstrap(mainClient, tenantId, 'founder@fresh.corp', 'sub-founder-fresh');
      if (!res.success) {
        console.error('Test 1 failure reason:', res.error);
      }
      assert.equal(res.success, true);

      // Verify owner exists
      const checkOwner = await mainClient.query(
        `SELECT COUNT(*)::int as c 
         FROM role_assignments ra
         JOIN tenant_memberships tm ON ra.tenant_id = tm.tenant_id AND ra.user_id = tm.user_id
         WHERE ra.tenant_id = $1 AND ra.role_id = $2 AND tm.status = 'ACTIVE'`,
        [tenantId, ownerRoleId]
      );
      assert.equal(checkOwner.rows[0].c, 1, 'Tenant must have exactly 1 active owner');

      // Verify audit
      const checkAudit = await mainClient.query(
        `SELECT action FROM admin_audit_events WHERE tenant_id = $1 AND action = 'BOOTSTRAP_EXECUTED'`,
        [tenantId]
      );
      assert.equal(checkAudit.rows.length, 1);
    } finally {
      await mainClient.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
    }
  });

  test('2. Repeat bootstrap on tenant is rejected fail-closed', async () => {
    const tRes = await mainClient.query(
      `INSERT INTO tenants (code, name, status, updated_at) 
       VALUES ('bootstrap-repeat-t', 'Repeat Tenant', 'ACTIVE', NOW()) RETURNING id`
    );
    const tenantId = tRes.rows[0].id;

    try {
      // First bootstrap
      const res1 = await executeBootstrap(mainClient, tenantId, 'founder1@corp.test', 'sub-f-1');
      assert.equal(res1.success, true);

      // Repeat bootstrap
      const res2 = await executeBootstrap(mainClient, tenantId, 'founder2@corp.test', 'sub-f-2');
      assert.equal(res2.success, false);
      assert.ok(res2.error?.includes('BOOTSTRAP_REJECTED'));
    } finally {
      await mainClient.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
    }
  });

  test('3. Concurrent competing bootstrap requests serialize: exactly one succeeds', async () => {
    const tRes = await mainClient.query(
      `INSERT INTO tenants (code, name, status, updated_at) 
       VALUES ('bootstrap-race-t', 'Race Tenant', 'ACTIVE', NOW()) RETURNING id`
    );
    const tenantId = tRes.rows[0].id;

    const client1 = await pool.connect();
    const client2 = await pool.connect();

    try {
      const [res1, res2] = await Promise.all([
        executeBootstrap(client1, tenantId, 'founderA@race.corp', 'sub-founder-a'),
        executeBootstrap(client2, tenantId, 'founderB@race.corp', 'sub-founder-b'),
      ]);

      const successes = [res1, res2].filter((r) => r.success);
      const failures = [res1, res2].filter((r) => !r.success);

      assert.equal(successes.length, 1, 'Exactly one concurrent bootstrap must succeed');
      assert.equal(failures.length, 1, 'Competing bootstrap must be rejected');

      // Final active owner count is exactly 1
      const countRes = await mainClient.query(
        `SELECT COUNT(*)::int as c 
         FROM role_assignments ra
         JOIN tenant_memberships tm ON ra.tenant_id = tm.tenant_id AND ra.user_id = tm.user_id
         WHERE ra.tenant_id = $1 AND ra.role_id = $2 AND tm.status = 'ACTIVE'`,
        [tenantId, ownerRoleId]
      );
      assert.equal(countRes.rows[0].c, 1, 'Tenant must have exactly 1 active owner after race');
    } finally {
      client1.release();
      client2.release();
      await mainClient.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
    }
  });
});
