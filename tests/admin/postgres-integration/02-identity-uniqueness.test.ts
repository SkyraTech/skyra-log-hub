import { test, describe, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import { Client } from 'pg';
import { getTestClient } from './fixtures.js';

describe('PostgreSQL Integration: Identity Uniqueness & Federation (Section 9)', () => {
  let client: Client;
  const createdUserIds: string[] = [];

  before(async () => {
    client = await getTestClient();
  });

  after(async () => {
    if (createdUserIds.length > 0) {
      await client.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [createdUserIds]);
    }
    await client.end();
  });

  test('1. Same issuer + same subject throws 23505 unique constraint violation', async () => {
    const issuer = 'https://accounts.google.com';
    const subject = 'sub-identity-collision-test';

    const res1 = await client.query(
      `INSERT INTO users (issuer, subject, email, display_name) 
       VALUES ($1, $2, 'test1@example.com', 'User One') RETURNING id`,
      [issuer, subject]
    );
    createdUserIds.push(res1.rows[0].id);

    // Attempt insert with exact same issuer and subject
    await assert.rejects(
      async () => {
        await client.query(
          `INSERT INTO users (issuer, subject, email, display_name) 
           VALUES ($1, $2, 'test2@example.com', 'User Two') RETURNING id`,
          [issuer, subject]
        );
      },
      (err: any) => {
        assert.equal(err.code, '23505', 'PostgreSQL error code must be 23505 (unique_violation)');
        assert.ok(err.constraint?.includes('uq_users_issuer_subject'), 'Violated constraint must be uq_users_issuer_subject');
        return true;
      }
    );
  });

  test('2. Different issuer + same subject succeeds as separate identities', async () => {
    const subject = 'sub-shared-id-across-idps';

    const res1 = await client.query(
      `INSERT INTO users (issuer, subject, email, display_name) 
       VALUES ('https://idp.okta.com', $1, 'okta.user@example.com', 'Okta User') RETURNING id`,
      [subject]
    );
    createdUserIds.push(res1.rows[0].id);

    const res2 = await client.query(
      `INSERT INTO users (issuer, subject, email, display_name) 
       VALUES ('https://login.microsoftonline.com/v2.0', $1, 'ms.user@example.com', 'Microsoft User') RETURNING id`,
      [subject]
    );
    createdUserIds.push(res2.rows[0].id);

    assert.notEqual(res1.rows[0].id, res2.rows[0].id, 'Different issuers must yield distinct primary keys');
  });

  test('3. Same issuer + different subject succeeds as separate identities', async () => {
    const issuer = 'https://auth.company.corp';

    const res1 = await client.query(
      `INSERT INTO users (issuer, subject, email, display_name) 
       VALUES ($1, 'sub-corp-user-1', 'corp1@company.corp', 'Corp User 1') RETURNING id`,
      [issuer]
    );
    createdUserIds.push(res1.rows[0].id);

    const res2 = await client.query(
      `INSERT INTO users (issuer, subject, email, display_name) 
       VALUES ($1, 'sub-corp-user-2', 'corp2@company.corp', 'Corp User 2') RETURNING id`,
      [issuer]
    );
    createdUserIds.push(res2.rows[0].id);

    assert.notEqual(res1.rows[0].id, res2.rows[0].id);
  });

  test('4. Same email + different issuer/subject succeeds without account hijacking', async () => {
    const email = 'shared.identity@enterprise.com';

    const res1 = await client.query(
      `INSERT INTO users (issuer, subject, email, display_name) 
       VALUES ('https://google.com', 'sub-g-1', $1, 'Google User') RETURNING id`,
      [email]
    );
    createdUserIds.push(res1.rows[0].id);

    const res2 = await client.query(
      `INSERT INTO users (issuer, subject, email, display_name) 
       VALUES ('https://github.com', 'sub-gh-1', $1, 'GitHub User') RETURNING id`,
      [email]
    );
    createdUserIds.push(res2.rows[0].id);

    assert.notEqual(res1.rows[0].id, res2.rows[0].id, 'Distinct provider accounts must coexist safely');
  });

  test('5. Invalid required fields throws 23502 not-null violation', async () => {
    await assert.rejects(
      async () => {
        await client.query(`INSERT INTO users (issuer, subject, display_name) VALUES ('iss', 'sub', 'name')`);
      },
      (err: any) => {
        assert.equal(err.code, '23502', 'Must fail with 23502 (not_null_violation) when email is missing');
        assert.equal(err.column, 'email');
        return true;
      }
    );
  });

  test('6. Referencing unknown identity in membership throws 23503 foreign key violation', async () => {
    // Generate valid tenant first
    const tRes = await client.query(`INSERT INTO tenants (code, name, updated_at) VALUES ('fk-test-t', 'FK Test', NOW()) RETURNING id`);
    const tenantId = tRes.rows[0].id;

    try {
      await assert.rejects(
        async () => {
          await client.query(
            `INSERT INTO tenant_memberships (tenant_id, user_id) 
             VALUES ($1, '00000000-0000-0000-0000-000000000099')`,
            [tenantId]
          );
        },
        (err: any) => {
          assert.equal(err.code, '23503', 'Must throw 23503 (foreign_key_violation)');
          assert.equal(err.constraint, 'fk_tenant_memberships_user');
          return true;
        }
      );
    } finally {
      await client.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
    }
  });

  test('7. Invalid UserStatus enum value throws 22P02 invalid text representation', async () => {
    await assert.rejects(
      async () => {
        await client.query(
          `INSERT INTO users (issuer, subject, email, display_name, status) 
           VALUES ('iss', 'sub-invalid-status', 'inv@test.com', 'Invalid User', 'SUPER_ADMIN'::"UserStatus")`
        );
      },
      (err: any) => {
        assert.equal(err.code, '22P02', 'Invalid enum value must throw 22P02');
        return true;
      }
    );
  });
});
