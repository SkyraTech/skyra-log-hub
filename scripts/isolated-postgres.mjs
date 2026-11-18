import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Client } from 'pg';
import { connectIsolatedClient } from './lib/isolated-target.mjs';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = path.join(root, '.tmp', 'feature001a-postgres');
const stateFile = path.join(directory, 'state.json');
const database = 'skyra_loghub_disposable_validation';
const role = 'skyra_isolated_user';
const administrator = 'skyra_test_admin';

function assertDirectory(state) {
  const expected = path.join(directory, 'data');
  if (path.resolve(state.data) !== expected || fs.lstatSync(directory).isSymbolicLink() ||
      !fs.realpathSync(directory).startsWith(fs.realpathSync(root) + path.sep) ||
      (fs.existsSync(expected) && fs.lstatSync(expected).isSymbolicLink()) ||
      state.database !== database || state.role !== role || state.port === 5432 ||
      !Number.isInteger(state.port) || state.port < 1024 || state.port > 65535 ||
      !/^[a-f0-9-]{36}$/.test(state.clusterId)) {
    throw new Error('ISOLATION: invalid ownership manifest or redirected directory');
  }
}

export function readState() {
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assertDirectory(state);
  return state;
}

export function testEnvironment(state = readState()) {
  assertDirectory(state);
  const url = new URL(`postgresql://${role}@127.0.0.1:${state.port}/${database}`);
  url.password = state.password;
  return { ...process.env, SKYRA_ISOLATED_TEST_ENV: 'true', ISOLATED_CLUSTER_ID: state.clusterId,
    ISOLATED_DATABASE_URL: url.href, DATABASE_URL: url.href };
}

function run(binary, args, state) {
  const result = spawnSync(path.join(state.bin, `${binary}${process.platform === 'win32' ? '.exe' : ''}`), args,
    { encoding: 'utf8', windowsHide: true, timeout: 45000,
      // Do not leave inherited pipe handles attached to the background Windows server.
      stdio: binary === 'pg_ctl' ? 'ignore' : 'pipe' });
  if (result.error || result.status !== 0) throw new Error(`${binary} failed: ${result.stderr || result.error?.message || result.stdout || 'see isolated server.log'}`);
  return result.stdout;
}

async function isPortFree(port) {
  return new Promise(resolve => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
  });
}

async function adminClient(state, db = database) {
  const client = new Client({ host: '127.0.0.1', port: state.port, database: db,
    user: administrator, password: state.adminPassword, connectionTimeoutMillis: 3000, query_timeout: 15000 });
  try {
    await client.connect();
    const { rows: [row] } = await client.query(`SELECT current_database() AS db, current_user AS role,
      inet_server_port() AS port, current_setting('data_directory') AS data,
      current_setting('server_version_num')::int AS version`);
    if (row.db !== db || row.role !== administrator || row.port !== state.port ||
        path.resolve(row.data) !== path.resolve(state.data) || row.version < 170000 || row.version >= 180000) {
      throw new Error('ISOLATION: admin live cluster/data directory mismatch');
    }
    return client;
  } catch (error) { await client.end().catch(() => {}); throw error; }
}

async function markDatabase(state) {
  const client = await adminClient(state);
  try {
    await client.query('CREATE SCHEMA skyra_test');
    await client.query('CREATE TABLE skyra_test.environment_identity (cluster_id text PRIMARY KEY)');
    await client.query('INSERT INTO skyra_test.environment_identity VALUES ($1)', [state.clusterId]);
    await client.query(`GRANT USAGE ON SCHEMA skyra_test TO ${role}`);
    await client.query(`GRANT SELECT ON skyra_test.environment_identity TO ${role}`);
  } finally { await client.end(); }
}

async function verify(state) {
  const admin = await adminClient(state);
  try {
    const { rows: [row] } = await admin.query(`SELECT version() AS version,
      current_setting('data_directory') AS data_directory,
      (SELECT rolsuper FROM pg_roles WHERE rolname=$1) AS test_role_superuser`, [role]);
    const env = testEnvironment(state);
    const test = await connectIsolatedClient(env.ISOLATED_DATABASE_URL, env);
    try {
      await test.query('BEGIN');
      await test.query('CREATE TABLE skyra_disposable_write_probe (marker uuid NOT NULL)');
      await test.query('INSERT INTO skyra_disposable_write_probe VALUES ($1)', [crypto.randomUUID()]);
      await test.query('ROLLBACK');
      const { rows: [probe] } = await test.query("SELECT to_regclass('public.skyra_disposable_write_probe') AS probe");
      if (probe.probe !== null) throw new Error('Probe did not roll back');
    } finally { await test.end(); }
    console.log(JSON.stringify({ host: '127.0.0.1', port: state.port, database, role,
      clusterId: state.clusterId, ...row, writeProbe: 'created, inserted, rolled back; absent' }, null, 2));
  } finally { await admin.end(); }
}

export async function main(action) {
  if (action === 'init') {
    if (fs.existsSync(directory)) throw new Error('Refusing to initialize an existing directory; use verify/start with its manifest');
    const bin = process.env.PG_BIN || (process.platform === 'win32'
      ? path.join(process.env.ProgramFiles || 'C:\\Program Files', 'PostgreSQL', '17', 'bin') : '/usr/lib/postgresql/17/bin');
    const port = Number(process.env.ISOLATED_PG_PORT || 5433);
    if (!Number.isInteger(port) || port === 5432 || port < 1024 || port > 65535 || !(await isPortFree(port))) {
      throw new Error('Test port invalid or already occupied; no initialization performed');
    }
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    if (!fs.realpathSync(directory).startsWith(fs.realpathSync(root) + path.sep)) {
      throw new Error('Refusing redirected test directory outside the repository');
    }
    if (process.platform === 'win32') {
      const acl = spawnSync('icacls.exe', [directory, '/inheritance:r', '/grant:r',
        `${process.env.USERDOMAIN}\\${process.env.USERNAME}:(OI)(CI)F`,
        '*S-1-5-18:(OI)(CI)F', '*S-1-5-32-544:(OI)(CI)F'], { encoding: 'utf8', windowsHide: true });
      if (acl.status !== 0) throw new Error('Cannot restrict isolated credential/data directory ACL');
    }
    const state = { clusterId: crypto.randomUUID(), port, bin, data: path.join(directory, 'data'),
      database, role, password: crypto.randomBytes(32).toString('hex'), adminPassword: crypto.randomBytes(32).toString('hex') };
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), { flag: 'wx', mode: 0o600 });
    assertDirectory(state);
    if (!/^initdb \(PostgreSQL\) 17\./.test(run('initdb', ['--version'], state))) throw new Error('PostgreSQL 17 required');
    const pwfile = path.join(directory, 'init-password');
    fs.writeFileSync(pwfile, state.adminPassword, { flag: 'wx', mode: 0o600 });
    try { run('initdb', ['-D', state.data, '-U', administrator, '--pwfile', pwfile,
      '--auth-host=scram-sha-256', '--auth-local=scram-sha-256', '--encoding=UTF8', '--locale=C'], state); }
    finally { fs.unlinkSync(pwfile); }
    fs.appendFileSync(path.join(state.data, 'postgresql.conf'), `\nlisten_addresses = '127.0.0.1'\nport = ${port}\n`);
    run('pg_ctl', ['-D', state.data, '-l', path.join(directory, 'server.log'), '-w', 'start'], state);
    const admin = await adminClient(state, 'postgres');
    try {
      // Password is generated hex, never a process command-line argument.
      await admin.query(`CREATE ROLE ${role} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '${state.password}'`);
      await admin.query(`CREATE DATABASE ${database} OWNER ${role}`);
    } finally { await admin.end(); }
    await markDatabase(state); await verify(state);
    return;
  }
  const state = readState();
  if (action === 'start') {
    const status = spawnSync(path.join(state.bin, process.platform === 'win32' ? 'pg_ctl.exe' : 'pg_ctl'),
      ['-D', state.data, 'status'], { encoding: 'utf8', windowsHide: true });
    if (status.status !== 0) {
      if (!(await isPortFree(state.port))) throw new Error('Port occupied; refusing to start');
      run('pg_ctl', ['-D', state.data, '-l', path.join(directory, 'server.log'), '-w', 'start'], state);
    }
    await verify(state);
  } else if (action === 'verify') await verify(state);
  else if (action === 'stop') {
    const admin = await adminClient(state); await admin.end();
    run('pg_ctl', ['-D', state.data, '-m', 'fast', '-w', 'stop'], state);
    console.log('Stopped only the manifest-owned isolated cluster');
  } else if (action === 'reset') {
    const env = testEnvironment(state);
    const test = await connectIsolatedClient(env.ISOLATED_DATABASE_URL, env); await test.end();
    const admin = await adminClient(state, 'postgres');
    try {
      await admin.query(`DROP DATABASE ${database} WITH (FORCE)`);
      await admin.query(`CREATE DATABASE ${database} OWNER ${role}`);
    } finally { await admin.end(); }
    await markDatabase(state); await verify(state);
  } else throw new Error('Usage: node scripts/isolated-postgres.mjs init|start|verify|stop|reset');
}

// Administrative test provisioning must still pass live physical-cluster identity checks.
export { adminClient as isolatedAdminClient };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv[2]).catch(error => { console.error(error.message); process.exitCode = 1; });
}
