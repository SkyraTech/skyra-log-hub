import { spawn } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const env = {
  ...process.env,
  SKYRA_ISOLATED_TEST_ENV: 'true',
  ISOLATED_DATABASE_URL:
    process.env.ISOLATED_DATABASE_URL ||
    'postgresql://skyra_isolated_user@127.0.0.1:5433/skyra_loghub_disposable_validation',
};

const args = [
  'dlx',
  'tsx',
  '--test',
  'tests/admin/postgres-integration/01-migration-and-parity.test.ts',
  'tests/admin/postgres-integration/02-identity-uniqueness.test.ts',
  'tests/admin/postgres-integration/03-tenant-isolation.test.ts',
  'tests/admin/postgres-integration/04-rbac-persistence.test.ts',
  'tests/admin/postgres-integration/05-last-owner-concurrency.test.ts',
  'tests/admin/postgres-integration/06-atomic-auditing.test.ts',
  'tests/admin/postgres-integration/07-bootstrap.test.ts',
  'tests/admin/postgres-integration/08-recovery-and-rollback.test.ts',
];

const pnpmCmd = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

const child = spawn(pnpmCmd, args, {
  cwd: rootDir,
  env,
  stdio: 'inherit',
  shell: true,
});

child.on('exit', (code) => {
  process.exit(code ?? 1);
});
