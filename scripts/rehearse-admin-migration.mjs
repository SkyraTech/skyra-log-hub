import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { root, testEnvironment } from './isolated-postgres.mjs';
import { connectIsolatedClient } from './lib/isolated-target.mjs';

const env = testEnvironment();
const client = await connectIsolatedClient(env.ISOLATED_DATABASE_URL, env);
const stageRoot = path.join(root, '.tmp', 'feature001a-rehearsal');
fs.mkdirSync(stageRoot, { recursive: true });
const stageRecord = path.join(stageRoot, 'active-stage.json');
const stage = process.argv[2] === 'harden'
  ? JSON.parse(fs.readFileSync(stageRecord, 'utf8')).stage
  : path.join(stageRoot, crypto.randomUUID(), 'prisma');
if (!path.resolve(stage).startsWith(stageRoot + path.sep)) throw new Error('Invalid staged migration directory');
const evidence = path.join(root, '.tmp', 'feature001a-evidence');
fs.mkdirSync(stage, { recursive: true }); fs.mkdirSync(evidence, { recursive: true });
fs.mkdirSync(path.join(stage, 'migrations'), { recursive: true });
const schema = path.join(stage, 'schema.prisma');
const requireAdmin = createRequire(path.join(root, 'apps/admin-service/package.json'));
const prisma = requireAdmin.resolve('prisma');
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const baseline = '20261024000000_init_metadata';
const admin = '20261028000000_admin_iam_foundation';
const hardening = '20261103000000_feature001a_audit_integrity';

function copyMigration(name, source) {
  const dir = path.join(stage, 'migrations', name); fs.mkdirSync(dir, { recursive: true });
  const bytes = fs.readFileSync(source);
  fs.writeFileSync(path.join(dir, 'migration.sql'), bytes);
  return { name, source: path.relative(root, source), bytes: bytes.length, sha256: hash(bytes) };
}

async function cli(args) {
  // Recheck marker/identity before each subprocess capable of migration writes.
  const checked = await connectIsolatedClient(env.ISOLATED_DATABASE_URL, env); await checked.end();
  const result = spawnSync(process.execPath, [prisma, ...args, '--schema', schema],
    { cwd: root, env, encoding: 'utf8', windowsHide: true, timeout: 45000 });
  const output = (result.stdout || '') + (result.stderr || '');
  console.log(output.replaceAll(env.ISOLATED_DATABASE_URL, '[isolated URL redacted]'));
  assert.equal(result.status, 0, `Prisma ${args[0]} ${args[1]} failed (${result.error?.code || result.status})`);
}

async function schemaFingerprint() {
  const { rows } = await client.query(`SELECT c.relname,a.attname,format_type(a.atttypid,a.atttypmod) AS type,
    a.attnotnull FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_attribute a ON a.attrelid=c.oid WHERE n.nspname='public' AND c.relkind='r'
    AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum`);
  const constraints = (await client.query("SELECT conrelid::regclass::text AS relation,conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE connamespace='public'::regnamespace ORDER BY 1,2")).rows;
  const indexes = (await client.query("SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY 1,2")).rows;
  const enums = (await client.query("SELECT t.typname,e.enumlabel FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid WHERE t.typnamespace='public'::regnamespace ORDER BY t.typname,e.enumsortorder")).rows;
  const triggers = (await client.query("SELECT tgname,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='public'::regnamespace AND NOT t.tgisinternal ORDER BY tgname")).rows;
  return hash(JSON.stringify({ columns: rows, constraints, indexes, enums, triggers }));
}

try {
  if (process.argv[2] === 'harden') {
    const artifact = copyMigration(hardening, path.join(root, 'docs/admin/migrations/FEATURE-001A-001/migration.sql'));
    const existing = await client.query('SELECT migration_name FROM public._prisma_migrations WHERE migration_name=$1', [hardening]);
    assert.equal(existing.rowCount, 0, 'Already hardened: use repeat-deploy validation, not raw SQL reapplication');
    const sql = fs.readFileSync(path.join(stage, 'migrations', hardening, 'migration.sql'), 'utf8');
    // Derived failure fixture is NOT the migration artifact; record its own checksum.
    const injected = sql.replace(/COMMIT;\s*$/, 'SELECT * FROM feature001a_intentional_missing_relation;\nCOMMIT;\n');
    await assert.rejects(client.query(injected), { code: '42P01' });
    await client.query('ROLLBACK');
    const { rows: [fk] } = await client.query("SELECT confdeltype FROM pg_constraint WHERE conname='fk_admin_audit_events_tenant'");
    assert.equal(fk.confdeltype, 'c', 'Failed hardening must restore original cascade FK');
    assert.equal((await client.query("SELECT to_regprocedure('public.reject_admin_audit_mutation()') AS function")).rows[0].function, null);
    await client.query(sql);
    await cli(['migrate', 'resolve', '--applied', hardening]);
    await cli(['migrate', 'deploy']);
    const ledger = (await client.query('SELECT migration_name,checksum FROM public._prisma_migrations ORDER BY migration_name')).rows;
    assert.equal(ledger.find(row => row.migration_name === hardening).checksum, artifact.sha256);
    fs.writeFileSync(path.join(evidence, 'hardening.json'), JSON.stringify({ artifact, ledger,
      injectedFixtureSha256: hash(injected), failureInjection: 'All FK/trigger/function changes rolled back before exact artifact application' }, null, 2));
    console.log('Hardening applied in isolation; ledger checksum and repeat deploy verified');
  } else if (!process.argv[2] || process.argv[2] === 'baseline') {
    const { rows: [empty] } = await client.query("SELECT count(*)::int AS count FROM pg_tables WHERE schemaname='public'");
    assert.equal(empty.count, 0, 'Rehearsal requires an empty owned test database; run the guarded reset explicitly');
    // Reject stale staged admin migrations before baseline deployment.
    for (const name of [admin, hardening]) {
      if (fs.existsSync(path.join(stage, 'migrations', name))) {
        throw new Error('Stale staged migrations; use a fresh rehearsal directory after explicit review');
      }
    }
    fs.copyFileSync(path.join(root, 'apps/ingestion-gateway/prisma/schema.prisma'), schema);
    fs.writeFileSync(path.join(stage, 'migrations', 'migration_lock.toml'), 'provider = "postgresql"\n', { flag: 'w' });
    const baselineArtifact = copyMigration(baseline, path.join(root, 'apps/ingestion-gateway/prisma/migrations', baseline, 'migration.sql'));
    await cli(['migrate', 'deploy']);
    const baseFingerprint = await schemaFingerprint();
    const adminArtifact = copyMigration(admin, path.join(root, 'docs/admin/migrations/ADMIN-002/migration.sql'));
    const sql = fs.readFileSync(path.join(stage, 'migrations', admin, 'migration.sql'), 'utf8');
    // Failure after the complete original candidate must leave no administration schema.
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('SELECT * FROM feature001a_intentional_missing_relation');
      assert.fail('Failure injection should throw');
    } catch (error) { assert.equal(error.code, '42P01'); }
    finally { await client.query('ROLLBACK'); }
    assert.equal((await client.query("SELECT to_regclass('public.users') AS table")).rows[0].table, null);
    assert.equal(await schemaFingerprint(), baseFingerprint);
    // Demonstrate why a statement-by-statement SQL executor without BEGIN is unsafe.
    await client.query('CREATE TABLE public.partial_application_probe (id int)');
    await assert.rejects(client.query('SELECT * FROM feature001a_intentional_missing_relation'), { code: '42P01' });
    assert.ok((await client.query("SELECT to_regclass('public.partial_application_probe') AS table")).rows[0].table);
    await client.query('DROP TABLE public.partial_application_probe');
    await client.query('BEGIN');
    try {
      await client.query("SET LOCAL lock_timeout='5s'");
      await client.query(sql);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    await cli(['migrate', 'resolve', '--applied', admin]);
    const fingerprint = await schemaFingerprint();
    await cli(['migrate', 'deploy']);
    assert.equal(await schemaFingerprint(), fingerprint);
    // A repeated raw candidate succeeds because of IF NOT EXISTS; no ledger duplication.
    await client.query('BEGIN');
    try { await client.query(sql); await client.query('COMMIT'); }
    catch (error) { await client.query('ROLLBACK'); throw error; }
    assert.equal(await schemaFingerprint(), fingerprint);
    await client.query('BEGIN');
    try {
      await client.query('ALTER TABLE public.tenants ADD COLUMN rehearsal_drift_probe integer');
      assert.notEqual(await schemaFingerprint(), fingerprint);
    } finally { await client.query('ROLLBACK'); }
    assert.equal(await schemaFingerprint(), fingerprint);
    const ledger = (await client.query('SELECT migration_name,checksum FROM public._prisma_migrations ORDER BY migration_name')).rows;
    assert.equal(ledger.length, 2);
    for (const artifact of [baselineArtifact, adminArtifact]) {
      assert.equal(ledger.find(row => row.migration_name === artifact.name).checksum, artifact.sha256);
    }
    const result = { artifacts: [baselineArtifact, adminArtifact], ledger, fingerprint,
      transactionalFailure: 'rolled back all admin tables and preserved baseline fingerprint',
      noTransactionFailure: 'separate prior DDL remained; probe removed', repeatDeployment: 'no pending migrations, no duplicate ledger',
      driftDetection: 'extra tenant column detected; rolled back',
      prismaModelLimitation: 'IAM models are present; SQL-managed expression indexes, checks, and audit triggers require separate catalog verification' };
    fs.writeFileSync(path.join(evidence, 'migration-rehearsal.json'), JSON.stringify(result, null, 2));
    fs.writeFileSync(stageRecord, JSON.stringify({ stage }));
    console.log(JSON.stringify(result, null, 2));
  } else throw new Error('Usage: node scripts/rehearse-admin-migration.mjs baseline|harden');
} finally { await client.end(); }
