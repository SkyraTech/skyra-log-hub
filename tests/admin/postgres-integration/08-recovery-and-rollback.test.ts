import { test, describe, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import { Client } from 'pg';
import { getTestClient } from './fixtures.js';

describe('PostgreSQL Integration: Migration Recovery & Rollback Execution (Section 16)', () => {
  let client: Client;

  before(async () => {
    client = await getTestClient();
    await client.query(`CREATE SCHEMA IF NOT EXISTS rollback_validation_schema`);
    await client.query(`SET search_path TO rollback_validation_schema, public`);
  });

  after(async () => {
    await client.query(`SET search_path TO public`);
    await client.query(`DROP SCHEMA IF EXISTS rollback_validation_schema CASCADE`);
    await client.end();
  });

  test('Rollback SQL successfully removes IAM tables in reverse dependency order without affecting baseline', async () => {
    // 1. Establish baseline operational tables in temporary schema
    await client.query(`
      CREATE TABLE rollback_validation_schema.tenants (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL
      );
      CREATE TABLE rollback_validation_schema.projects (
        id VARCHAR(64) PRIMARY KEY,
        tenant_id UUID REFERENCES rollback_validation_schema.tenants(id),
        name VARCHAR(255) NOT NULL
      );
    `);

    // 2. Apply IAM tables in temporary schema
    await client.query(`
      CREATE TABLE rollback_validation_schema.users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) NOT NULL
      );
      CREATE TABLE rollback_validation_schema.tenant_memberships (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID REFERENCES rollback_validation_schema.tenants(id) ON DELETE CASCADE,
        user_id UUID REFERENCES rollback_validation_schema.users(id) ON DELETE CASCADE
      );
      CREATE TABLE rollback_validation_schema.admin_audit_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID REFERENCES rollback_validation_schema.tenants(id) ON DELETE CASCADE,
        actor_user_id UUID REFERENCES rollback_validation_schema.users(id) ON DELETE SET NULL,
        action VARCHAR(64) NOT NULL
      );
    `);

    // Verify 5 tables exist
    const preRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'rollback_validation_schema'
      ORDER BY table_name;
    `);
    assert.equal(preRes.rows.length, 5);

    // 3. Execute Day-0 Rollback Script
    await client.query(`
      BEGIN;
      DROP TABLE IF EXISTS rollback_validation_schema.admin_audit_events CASCADE;
      DROP TABLE IF EXISTS rollback_validation_schema.tenant_memberships CASCADE;
      DROP TABLE IF EXISTS rollback_validation_schema.users CASCADE;
      COMMIT;
    `);

    // 4. Verify baseline tables remain intact
    const postRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'rollback_validation_schema'
      ORDER BY table_name;
    `);
    const remaining = postRes.rows.map((r) => r.table_name);
    assert.deepEqual(remaining.sort(), ['projects', 'tenants']);
  });
});
