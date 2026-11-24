/**
 * CI Disposable PostgreSQL Initialization & Guard Verification Script
 * Strictly for CI environment with GitHub Actions disposable service container.
 * Enforces non-5432 port, disposable database name, and environment identity marker.
 */
import { Client } from 'pg';
import { validateTestTarget, connectIsolatedClient } from './lib/isolated-target.mjs';

const connectionString = process.env.ISOLATED_DATABASE_URL || process.env.DATABASE_URL;
const env = process.env;

console.log('--- CI Disposable PostgreSQL Initializer ---');
const target = validateTestTarget(connectionString, env);
console.log(`Validated target: host=${target.host}, port=${target.port}, db=${target.database}, user=${target.user}`);

if (target.port === 5432) {
  throw new Error('ISOLATION VIOLATION: Protected default port 5432 is strictly prohibited.');
}

const client = new Client({
  connectionString: target.connectionString,
  connectionTimeoutMillis: 5000
});

try {
  await client.connect();
  console.log('Connected to disposable PostgreSQL instance.');

  // Initialize skyra_test schema and environment identity marker
  await client.query('CREATE SCHEMA IF NOT EXISTS skyra_test');
  await client.query(`
    CREATE TABLE IF NOT EXISTS skyra_test.environment_identity (
      cluster_id text PRIMARY KEY
    )
  `);

  await client.query('DELETE FROM skyra_test.environment_identity');
  await client.query(
    'INSERT INTO skyra_test.environment_identity (cluster_id) VALUES ($1)',
    [env.ISOLATED_CLUSTER_ID]
  );
  console.log(`Initialized environment_identity marker with cluster_id: ${env.ISOLATED_CLUSTER_ID}`);

  // Create runtime roles if they do not exist
  const roles = [
    'skyra_org_runtime',
    'skyra_ingestion_runtime',
    'skyra_bff_sessions_runtime',
    'skyra_query_runtime'
  ];

  for (const role of roles) {
    const { rows } = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role]);
    if (rows.length === 0) {
      await client.query(`CREATE ROLE ${role} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD 'ci_runtime_password'`);
      console.log(`Created disposable runtime role: ${role}`);
    }
    await client.query(`GRANT USAGE ON SCHEMA skyra_test TO ${role}`);
    await client.query(`GRANT SELECT ON skyra_test.environment_identity TO ${role}`);
  }

  console.log('Disposable PostgreSQL initialization completed successfully.');
} finally {
  await client.end().catch(() => {});
}

// Verify connected client via library guard
console.log('Verifying connection through connectIsolatedClient guard...');
const verifiedClient = await connectIsolatedClient(target.connectionString, env);
await verifiedClient.end();
console.log('✔ Target guard validation PASSED against disposable PostgreSQL instance.');

