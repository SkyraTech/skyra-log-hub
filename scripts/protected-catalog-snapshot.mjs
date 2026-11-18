// Deliberately separate from all mutation runners. Every statement is read-only.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Client } from 'pg';
import { root } from './isolated-postgres.mjs';

const mode = process.argv[2];
const label = process.argv[3] || 'feature001a';
if (!/^(feature001[abcd]|feature00[23456789]|feature01[01]|dev01[2345678])$/.test(label)) throw new Error('Invalid evidence label');
if (!['before', 'after'].includes(mode)) throw new Error('Use before|after');
const config = fs.readFileSync(path.join(root, 'apps/ingestion-gateway/.env'), 'utf8');
const raw = config.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim().replace(/^["']|["']$/g, '');
if (!raw) throw new Error('Existing protected configuration missing');
const url = new URL(raw);
if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.port !== '5432' ||
    url.pathname !== '/skyra_loghub_dev' || decodeURIComponent(url.username) !== 'skyra_loghub_user') {
  throw new Error('Protected target differs; no connection attempted');
}
const client = new Client({ host: '127.0.0.1', port: 5432, database: 'skyra_loghub_dev',
  user: 'skyra_loghub_user', password: decodeURIComponent(url.password), connectionTimeoutMillis: 3000,
  options: '-c default_transaction_read_only=on', application_name: 'feature001a-readonly-snapshot' });
try {
  await client.connect();
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const { rows: [identity] } = await client.query(`SELECT current_database() AS database,
    current_user AS role, inet_server_port() AS port, version(), current_setting('transaction_read_only') AS readonly`);
  if (identity.database !== 'skyra_loghub_dev' || identity.role !== 'skyra_loghub_user' ||
      identity.port !== 5432 || identity.readonly !== 'on') throw new Error('Protected live identity mismatch');
  const queries = {
    columns: "SELECT table_name,column_name,data_type,udt_name,is_nullable,column_default,character_maximum_length FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position",
    constraints: "SELECT conrelid::regclass::text AS relation, conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE connamespace='public'::regnamespace ORDER BY 1,2",
    indexes: "SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY 1,2",
    enums: "SELECT t.typname,e.enumlabel FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid WHERE t.typnamespace='public'::regnamespace ORDER BY t.typname,e.enumsortorder",
    ledger: 'SELECT * FROM public._prisma_migrations ORDER BY migration_name,id',
  };
  const snapshot = { identity };
  for (const [key, sql] of Object.entries(queries)) snapshot[key] = (await client.query(sql)).rows;
  const tables = (await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
  snapshot.data = [];
  for (const { tablename } of tables) {
    const identifier = '"' + tablename.replaceAll('"', '""') + '"';
    const { rows: [digest] } = await client.query(`SELECT count(*)::int AS rows,
      md5(coalesce(string_agg(row_to_json(t)::text, '' ORDER BY row_to_json(t)::text),'')) AS digest FROM public.${identifier} t`);
    snapshot.data.push({ table: tablename, ...digest });
  }
  await client.query('ROLLBACK');
  const dir = path.join(root, '.tmp', `${label}-evidence`); fs.mkdirSync(dir, { recursive: true });
  const content = JSON.stringify(snapshot, null, 2);
  const digest = crypto.createHash('sha256').update(content).digest('hex');
  if (mode === 'after' && fs.readFileSync(path.join(dir, 'protected-before.json'), 'utf8') !== content) {
    throw new Error('Protected snapshot changed; inspect concurrent changes before claiming preservation');
  }
  fs.writeFileSync(path.join(dir, `protected-${mode}.json`), content);
  console.log(JSON.stringify({ mode, identity, tables: snapshot.data, snapshotSha256: digest,
    unchanged: mode === 'after' ? true : undefined }, null, 2));
} finally { await client.end(); }
