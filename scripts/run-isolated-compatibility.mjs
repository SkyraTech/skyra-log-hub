import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { root, testEnvironment } from './isolated-postgres.mjs';
import { connectIsolatedClient } from './lib/isolated-target.mjs';

const env = testEnvironment();
const client = await connectIsolatedClient(env.ISOLATED_DATABASE_URL, env); await client.end();
const require = createRequire(path.join(root, 'apps/ingestion-gateway/package.json'));
// Use the service's own compiler version/config, without launching its full suite.
const manifest = require.resolve('typescript/package.json');
const compiler = path.resolve(path.dirname(manifest), JSON.parse(fs.readFileSync(manifest, 'utf8')).bin.tsc);
for (const args of [[compiler, '-p', 'tsconfig.test.json'],
  ['--test', 'dist-test/tests/integration/live-postgresql.test.js']]) {
  const result = spawnSync(process.execPath, args, { cwd: path.join(root, 'apps/ingestion-gateway'),
    env, stdio: 'inherit', windowsHide: true, timeout: 45000 });
  if (result.status !== 0) { process.exitCode = result.status || 1; break; }
}
