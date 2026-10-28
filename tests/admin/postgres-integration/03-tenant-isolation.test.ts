import { test, describe, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import { Client } from 'pg';
import {
  getTestClient,
  setupSyntheticFixtures,
  cleanupSyntheticFixtures,
  type SyntheticFixtureData,
} from './fixtures.js';

describe('PostgreSQL Integration: Multi-Tenant & Project Isolation (Section 10)', () => {
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

  test('1. Valid Tenant A project membership succeeds', async () => {
    // First create tenant membership
    await client.query(
      `INSERT INTO tenant_memberships (tenant_id, user_id, status)
       VALUES ($1, $2, 'ACTIVE')`,
      [fixtures.tenantAId, fixtures.userAId]
    );

    const res = await client.query(
      `INSERT INTO project_memberships (tenant_id, project_id, user_id, status)
       VALUES ($1, $2, $3, 'ACTIVE')
       RETURNING id, status`,
      [fixtures.tenantAId, fixtures.projectAId, fixtures.userAId]
    );

    assert.ok(res.rows[0].id);
    assert.equal(res.rows[0].status, 'ACTIVE');
  });

  test('2. Valid Tenant B project membership succeeds', async () => {
    await client.query(
      `INSERT INTO tenant_memberships (tenant_id, user_id, status)
       VALUES ($1, $2, 'ACTIVE')`,
      [fixtures.tenantBId, fixtures.userBId]
    );

    const res = await client.query(
      `INSERT INTO project_memberships (tenant_id, project_id, user_id, status)
       VALUES ($1, $2, $3, 'ACTIVE')
       RETURNING id, status`,
      [fixtures.tenantBId, fixtures.projectBId, fixtures.userBId]
    );

    assert.ok(res.rows[0].id);
    assert.equal(res.rows[0].status, 'ACTIVE');
  });

  test('3. Project membership referencing non-existent project fails closed with 23503', async () => {
    await assert.rejects(
      async () => {
        await client.query(
          `INSERT INTO project_memberships (tenant_id, project_id, user_id, status)
           VALUES ($1, 'non-existent-proj-id', $2, 'ACTIVE')`,
          [fixtures.tenantAId, fixtures.userAId]
        );
      },
      (err: any) => {
        assert.equal(err.code, '23503', 'Must fail with foreign key violation (23503)');
        assert.equal(err.constraint, 'fk_project_memberships_project');
        return true;
      }
    );
  });

  test('4. Project membership referencing non-existent tenant fails closed with 23503', async () => {
    await assert.rejects(
      async () => {
        await client.query(
          `INSERT INTO project_memberships (tenant_id, project_id, user_id, status)
           VALUES ('00000000-0000-0000-0000-000000000001', $1, $2, 'ACTIVE')`,
          [fixtures.projectAId, fixtures.userAId]
        );
      },
      (err: any) => {
        assert.equal(err.code, '23503');
        assert.equal(err.constraint, 'fk_project_memberships_tenant');
        return true;
      }
    );
  });

  test('5. Duplicate active tenant membership throws 23505 unique violation', async () => {
    await assert.rejects(
      async () => {
        await client.query(
          `INSERT INTO tenant_memberships (tenant_id, user_id, status)
           VALUES ($1, $2, 'ACTIVE')`,
          [fixtures.tenantAId, fixtures.userAId]
        );
      },
      (err: any) => {
        assert.equal(err.code, '23505', 'Duplicate tenant membership must throw 23505');
        assert.equal(err.constraint, 'uq_tenant_memberships_tenant_user');
        return true;
      }
    );
  });

  test('6. Duplicate project membership scope throws 23505 unique violation', async () => {
    await assert.rejects(
      async () => {
        await client.query(
          `INSERT INTO project_memberships (tenant_id, project_id, user_id, status)
           VALUES ($1, $2, $3, 'ACTIVE')`,
          [fixtures.tenantAId, fixtures.projectAId, fixtures.userAId]
        );
      },
      (err: any) => {
        assert.equal(err.code, '23505', 'Duplicate project scope must throw 23505');
        assert.equal(err.constraint, 'uq_project_memberships_scope');
        return true;
      }
    );
  });

  test('7. Cascading tenant deletion removes child memberships cleanly', async () => {
    // Create ephemeral tenant with membership
    const tRes = await client.query(
      `INSERT INTO tenants (code, name, updated_at) VALUES ('ephemeral-t', 'Ephemeral Tenant', NOW()) RETURNING id`
    );
    const ephemeralTenantId = tRes.rows[0].id;

    const tmRes = await client.query(
      `INSERT INTO tenant_memberships (tenant_id, user_id, status) VALUES ($1, $2, 'ACTIVE') RETURNING id`,
      [ephemeralTenantId, fixtures.userAId]
    );
    const membershipId = tmRes.rows[0].id;

    // Delete parent tenant
    await client.query(`DELETE FROM tenants WHERE id = $1`, [ephemeralTenantId]);

    // Check that membership is gone
    const checkRes = await client.query(`SELECT id FROM tenant_memberships WHERE id = $1`, [membershipId]);
    assert.equal(checkRes.rows.length, 0, 'Child membership must be cascaded on tenant deletion');
  });

  test('8. Audit trail immutability: Deleting actor user sets actor_user_id to NULL while retaining audit trail', async () => {
    // Create temporary actor user
    const uRes = await client.query(
      `INSERT INTO users (issuer, subject, email, display_name) 
       VALUES ('https://accounts.google.com', 'sub-actor-temp-001', 'actor.temp@test.internal', 'Temp Actor') 
       RETURNING id`
    );
    const tempActorId = uRes.rows[0].id;

    // Create audit event referencing this actor
    const auditRes = await client.query(
      `INSERT INTO admin_audit_events (
         tenant_id, actor_user_id, actor_email, action, target_type, target_id, details
       ) VALUES (
         $1, $2, 'actor.temp@test.internal', 'MEMBER_INVITED', 'invitation', 'inv-123', '{"role":"OrgAdmin"}'
       ) RETURNING id`,
      [fixtures.tenantAId, tempActorId]
    );
    const auditId = auditRes.rows[0].id;

    // Delete actor user
    await client.query(`DELETE FROM users WHERE id = $1`, [tempActorId]);

    // Verify audit event remains intact with actor_user_id = NULL
    const checkAudit = await client.query(
      `SELECT actor_user_id, actor_email, action FROM admin_audit_events WHERE id = $1`,
      [auditId]
    );
    assert.equal(checkAudit.rows.length, 1, 'Audit record must survive actor user deletion');
    assert.equal(checkAudit.rows[0].actor_user_id, null, 'actor_user_id must be SET NULL');
    assert.equal(checkAudit.rows[0].actor_email, 'actor.temp@test.internal', 'actor_email must be preserved');
    assert.equal(checkAudit.rows[0].action, 'MEMBER_INVITED');
  });
});
