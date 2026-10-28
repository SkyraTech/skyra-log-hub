import { test, describe, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import { Client, Pool } from 'pg';
import {
  getTestClient,
  getTestPool,
  seedStandardRolesAndPermissions,
} from './fixtures.js';

describe('PostgreSQL Integration: Last-Owner Concurrency Safety (Section 12 & 13 - P0)', () => {
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

  /**
   * Concurrency-safe ownership revocation worker using tenant-level pessimistic row locking.
   */
  async function executeSafeRevocation(
    client: Client,
    tenantId: string,
    targetUserId: string,
    actorEmail: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await client.query('BEGIN');

      // 1. Mandatory Pessimistic Tenant Lock:
      // Serializes all ownership-reducing operations across competing transactions
      await client.query('SELECT id FROM tenants WHERE id = $1 FOR UPDATE', [tenantId]);

      // Small artificial delay to simulate realistic business logic processing while lock is held
      await new Promise((resolve) => setTimeout(resolve, 50));

      // 2. Count current active owners under the locked snapshot
      const countRes = await client.query(
        `SELECT COUNT(DISTINCT tm.user_id)::int as owner_count
         FROM tenant_memberships tm
         JOIN role_assignments ra 
           ON tm.tenant_id = ra.tenant_id 
          AND tm.user_id = ra.user_id 
          AND ra.role_id = $1 
          AND ra.project_id IS NULL
         WHERE tm.tenant_id = $2 
           AND tm.status = 'ACTIVE'`,
        [ownerRoleId, tenantId]
      );

      const activeOwners = countRes.rows[0].owner_count;

      // 3. Last-Owner Protection Invariant
      if (activeOwners <= 1) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: `LAST_OWNER_CONFLICT: Tenant ${tenantId} has only ${activeOwners} active owner(s). Revocation rejected.`,
        };
      }

      // 4. Safe to revoke: update membership status
      await client.query(
        `UPDATE tenant_memberships 
         SET status = 'REVOKED', updated_at = NOW() 
         WHERE tenant_id = $1 AND user_id = $2`,
        [tenantId, targetUserId]
      );

      // 5. Atomic audit event write within the same transaction
      await client.query(
        `INSERT INTO admin_audit_events (
           tenant_id, actor_email, action, target_type, target_id, details
         ) VALUES ($1, $2, 'MEMBER_REMOVED', 'membership', $3, '{"role":"OrgOwner","reason":"concurrency_test"}')`,
        [tenantId, actorEmail, targetUserId]
      );

      await client.query('COMMIT');
      return { success: true };
    } catch (err: any) {
      await client.query('ROLLBACK').catch(() => {});
      return { success: false, error: err.message };
    }
  }

  test('Race condition: Two simultaneous competing transactions attempting to revoke different owners serialize safely', async () => {
    // 1. Setup Tenant with exactly TWO active owners
    const tRes = await mainClient.query(
      `INSERT INTO tenants (code, name, status, updated_at) 
       VALUES ('concurrent-owner-t', 'Concurrent Test Tenant', 'ACTIVE', NOW()) 
       RETURNING id`
    );
    const tenantId = tRes.rows[0].id;

    // Create Owner 1 & Owner 2
    const u1Res = await mainClient.query(
      `INSERT INTO users (issuer, subject, email, display_name) 
       VALUES ('https://accounts.google.com', 'sub-owner-1', 'owner1@concurrent.test', 'Owner One') 
       RETURNING id`
    );
    const owner1Id = u1Res.rows[0].id;

    const u2Res = await mainClient.query(
      `INSERT INTO users (issuer, subject, email, display_name) 
       VALUES ('https://accounts.google.com', 'sub-owner-2', 'owner2@concurrent.test', 'Owner Two') 
       RETURNING id`
    );
    const owner2Id = u2Res.rows[0].id;

    // Establish memberships
    await mainClient.query(
      `INSERT INTO tenant_memberships (tenant_id, user_id, status) VALUES ($1, $2, 'ACTIVE'), ($1, $3, 'ACTIVE')`,
      [tenantId, owner1Id, owner2Id]
    );

    // Assign OrgOwner role to both
    await mainClient.query(
      `INSERT INTO role_assignments (tenant_id, user_id, role_id, project_id) 
       VALUES ($1, $2, $4, NULL), ($1, $3, $4, NULL)`,
      [tenantId, owner1Id, owner2Id, ownerRoleId]
    );

    // Verify initial count is exactly 2
    const initCheck = await mainClient.query(
      `SELECT COUNT(*)::int as count FROM tenant_memberships tm
       JOIN role_assignments ra ON tm.tenant_id = ra.tenant_id AND tm.user_id = ra.user_id AND ra.role_id = $1
       WHERE tm.tenant_id = $2 AND tm.status = 'ACTIVE'`,
      [ownerRoleId, tenantId]
    );
    assert.equal(initCheck.rows[0].count, 2, 'Initial active owner count must be 2');

    // 2. Launch two simultaneous competing transactions
    const client1 = await pool.connect();
    const client2 = await pool.connect();

    try {
      const [res1, res2] = await Promise.all([
        executeSafeRevocation(client1, tenantId, owner1Id, 'adminA@skyra.internal'),
        executeSafeRevocation(client2, tenantId, owner2Id, 'adminB@skyra.internal'),
      ]);

      // 3. Verify exactly one succeeded and one was blocked
      const successes = [res1, res2].filter((r) => r.success);
      const failures = [res1, res2].filter((r) => !r.success);

      assert.equal(successes.length, 1, 'Exactly one concurrent revocation must succeed');
      assert.equal(failures.length, 1, 'Exactly one concurrent revocation must fail with last-owner conflict');
      assert.ok(
        failures[0].error?.includes('LAST_OWNER_CONFLICT'),
        `Expected last-owner conflict error, got: ${failures[0].error}`
      );

      // 4. Invariant Verification: Tenant MUST have at least 1 active owner remaining
      const finalCountRes = await mainClient.query(
        `SELECT COUNT(*)::int as count FROM tenant_memberships tm
         JOIN role_assignments ra ON tm.tenant_id = ra.tenant_id AND tm.user_id = ra.user_id AND ra.role_id = $1
         WHERE tm.tenant_id = $2 AND tm.status = 'ACTIVE'`,
        [ownerRoleId, tenantId]
      );
      assert.equal(finalCountRes.rows[0].count, 1, 'CRITICAL: Tenant must have exactly 1 active owner remaining');

      // 5. Audit Log Consistency: Exactly 1 MEMBER_REMOVED audit event committed
      const auditRes = await mainClient.query(
        `SELECT action, actor_email, target_id FROM admin_audit_events WHERE tenant_id = $1 ORDER BY created_at ASC`,
        [tenantId]
      );
      assert.equal(auditRes.rows.length, 1, 'Exactly 1 audit event should be recorded');
      assert.equal(auditRes.rows[0].action, 'MEMBER_REMOVED');
    } finally {
      client1.release();
      client2.release();
      // Cleanup
      await mainClient.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
      await mainClient.query(`DELETE FROM users WHERE id IN ($1, $2)`, [owner1Id, owner2Id]);
    }
  });
});
