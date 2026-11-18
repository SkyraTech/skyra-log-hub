import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { connectIsolatedClient } from '../../scripts/lib/isolated-target.mjs';

let client, tenant, user, audit;
beforeEach(async () => {
  client = await connectIsolatedClient(process.env.ISOLATED_DATABASE_URL);
  await client.query('BEGIN');
  const suffix = crypto.randomUUID();
  tenant = (await client.query("INSERT INTO tenants(code,name,updated_at) VALUES($1,'Audit fixture',now()) RETURNING id", [suffix])).rows[0].id;
  user = (await client.query("INSERT INTO users(issuer,subject,email,display_name) VALUES('https://test.invalid',$1,'fixture@test.invalid','Fixture') RETURNING id", [suffix])).rows[0].id;
  audit = (await client.query(`INSERT INTO admin_audit_events(tenant_id,actor_user_id,actor_email,action,target_type,target_id)
    VALUES($1,$2,'fixture@test.invalid','TENANT_UPDATED','tenant',$3) RETURNING id`, [tenant, user, tenant])).rows[0].id;
});
afterEach(async () => { if (client) { await client.query('ROLLBACK'); await client.end(); } });

test('audit INSERT and SELECT remain available', async () => {
  const { rows } = await client.query('SELECT action FROM admin_audit_events WHERE id=$1', [audit]);
  assert.equal(rows[0].action, 'TENANT_UPDATED');
});
for (const [name, sql] of [
  ['UPDATE', 'UPDATE admin_audit_events SET action=action WHERE id=$1'],
  ['DELETE', 'DELETE FROM admin_audit_events WHERE id=$1'],
  ['TRUNCATE', 'TRUNCATE admin_audit_events'],
]) test(`audit ${name} is rejected for the ordinary database owner`, async () => {
  await assert.rejects(client.query(sql, name === 'TRUNCATE' ? [] : [audit]), { code: '55000' });
});
test('tenant deletion cannot cascade away audit history', async () => {
  await assert.rejects(client.query('DELETE FROM tenants WHERE id=$1', [tenant]), { code: '23503' });
});
test('actor deletion cannot silently rewrite the audit reference', async () => {
  await assert.rejects(client.query('DELETE FROM users WHERE id=$1', [user]), { code: '23503' });
});
test('actor identifier update cannot rewrite the audit reference', async () => {
  await assert.rejects(client.query('UPDATE users SET id=$1 WHERE id=$2', [crypto.randomUUID(), user]), { code: '23503' });
});
test('audit insertion failure rolls back a prior tenant name mutation', async () => {
  await client.query('SAVEPOINT audit_failure');
  await client.query("UPDATE tenants SET name='Should roll back' WHERE id=$1", [tenant]);
  await assert.rejects(client.query(`INSERT INTO admin_audit_events(tenant_id,actor_email,action,target_type,target_id)
    VALUES($1,NULL,'TENANT_UPDATED','tenant',$2)`, [tenant, tenant]), { code: '23502' });
  await client.query('ROLLBACK TO SAVEPOINT audit_failure');
  assert.equal((await client.query('SELECT name FROM tenants WHERE id=$1', [tenant])).rows[0].name, 'Audit fixture');
});
test('both immutable triggers and restrictive audit FKs exist', async () => {
  const triggers = (await client.query("SELECT tgname FROM pg_trigger WHERE tgrelid='public.admin_audit_events'::regclass AND NOT tgisinternal ORDER BY tgname")).rows;
  assert.deepEqual(triggers.map(row => row.tgname), ['admin_audit_reject_truncate', 'admin_audit_reject_update_delete']);
  const fks = (await client.query("SELECT confdeltype,confupdtype FROM pg_constraint WHERE conname IN ('fk_admin_audit_events_tenant','fk_admin_audit_events_actor')")).rows;
  assert.equal(fks.length, 2);
  assert.ok(fks.every(row => row.confdeltype === 'r' && row.confupdtype === 'r'));
});
test('tenant/project constraint matches the explicitly applied migration stage', async () => {
  const other = (await client.query("INSERT INTO tenants(code,name,updated_at) VALUES($1,'Other',now()) RETURNING id", [crypto.randomUUID()])).rows[0].id;
  const project = crypto.randomUUID();
  await client.query("INSERT INTO projects(id,tenant_id,name,updated_at) VALUES($1,$2,'Other project',now())", [project, other]);
  const corrected = (await client.query("SELECT 1 FROM pg_constraint WHERE conname='project_memberships_tenant_project_fkey'")).rowCount === 1;
  if (corrected) await assert.rejects(client.query('INSERT INTO project_memberships(tenant_id,project_id,user_id) VALUES($1,$2,$3)', [tenant, project, user]), {code:'23503'});
  else {
    const result = await client.query('INSERT INTO project_memberships(tenant_id,project_id,user_id) VALUES($1,$2,$3) RETURNING id', [tenant, project, user]);
    assert.equal(result.rowCount, 1, 'Original migration stage documents the missing composite FK; Feature-001B must add it');
  }
});
