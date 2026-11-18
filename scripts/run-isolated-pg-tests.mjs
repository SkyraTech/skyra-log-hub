import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { root, testEnvironment } from './isolated-postgres.mjs';
import { assertIsolatedDatabaseEnvironment } from './lib/isolated-target.mjs';
import { connectIsolatedClient } from './lib/isolated-target.mjs';

// Use provisioner-owned credentials and a locked local runner; no dlx/network or fallback target.
const env = testEnvironment();
Object.assign(process.env, env);
await assertIsolatedDatabaseEnvironment(env.ISOLATED_DATABASE_URL);
const hardened = process.argv[2] === 'hardened';
if (process.argv[2] && !hardened) throw new Error('Use no arguments for original migration tests, or hardened');
const check = await connectIsolatedClient(env.ISOLATED_DATABASE_URL, env);
try {
  const { rows } = await check.query("SELECT migration_name FROM public._prisma_migrations WHERE migration_name='20261103000000_feature001a_audit_integrity'");
  if (Boolean(rows.length) !== hardened) throw new Error('Suite/schema stage mismatch: original suites require original ADMIN-002; hardened suite requires follow-up migration');
} finally { await check.end(); }
const files = hardened ? ['tests/admin/postgres-hardening.test.mjs'] : fs.readdirSync(path.join(root, 'tests/admin/postgres-integration'))
  .filter(name => /^\d.*\.test\.ts$/.test(name)).sort()
  .map(name => path.join('tests/admin/postgres-integration', name));
const child = spawn(process.execPath, ['--import', 'tsx', '--test', '--test-concurrency=1', ...files],
  { cwd: root, env, stdio: 'inherit', windowsHide: true });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
