import { Client } from 'pg';

export interface IsolatedDbTarget {
  connectionString: string;
  host: string;
  port: number;
  database: string;
  user: string;
}

/**
 * Strict database safety guard.
 * Prevents any test execution against protected databases or shared development instances.
 */
export async function assertIsolatedDatabaseEnvironment(connectionString?: string): Promise<IsolatedDbTarget> {
  const url = connectionString ?? process.env.ISOLATED_DATABASE_URL;

  if (!url) {
    throw new Error(
      '[FATAL SAFETY VIOLATION] ISOLATED_DATABASE_URL environment variable is missing. ' +
      'Refusing to run PostgreSQL integration tests without an explicit isolated database target.'
    );
  }

  // Mandatory environment marker
  if (process.env.SKYRA_ISOLATED_TEST_ENV !== 'true') {
    throw new Error(
      '[FATAL SAFETY VIOLATION] SKYRA_ISOLATED_TEST_ENV="true" is required. ' +
      'Refusing to run tests without explicit confirmation of a disposable environment.'
    );
  }

  const parsed = new URL(url);
  const host = parsed.hostname;
  const port = parseInt(parsed.port || '5432', 10);
  const dbName = parsed.pathname.replace(/^\//, '');

  // Safety checks against protected databases
  const prohibitedDbNames = [
    'skyra_loghub_dev',
    'skyra_loghub_prod',
    'skyra_loghub_staging',
    'postgres',
    'template1',
  ];

  if (prohibitedDbNames.includes(dbName.toLowerCase()) || dbName.toLowerCase().includes('bachina')) {
    throw new Error(
      `[FATAL SAFETY VIOLATION] Target database "${dbName}" is a protected database name. ` +
      'Integration tests must only execute against a disposable database containing "disposable", "isolated", or "test".'
    );
  }

  if (port === 5432) {
    throw new Error(
      '[FATAL SAFETY VIOLATION] Target port is 5432. ' +
      'The protected local PostgreSQL instance listens on port 5432. ' +
      'Integration tests must run against an isolated instance on an alternate port (e.g., 5433).'
    );
  }

  // Live verification of target instance identity
  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    const res = await client.query(`
      SELECT 
        version(),
        current_user as db_user,
        current_database() as db_name,
        inet_server_port() as server_port
    `);

    const row = res.rows[0];
    const livePort = parseInt(row.server_port, 10);
    const liveDb = row.db_name;
    const liveUser = row.db_user;

    if (livePort === 5432) {
      throw new Error(`[FATAL SAFETY VIOLATION] PostgreSQL engine reported live port 5432. Aborting immediately.`);
    }

    if (liveDb.toLowerCase() === 'skyra_loghub_dev') {
      throw new Error(`[FATAL SAFETY VIOLATION] Connected to skyra_loghub_dev! Aborting immediately.`);
    }

    return {
      connectionString: url,
      host,
      port: livePort,
      database: liveDb,
      user: liveUser,
    };
  } finally {
    await client.end();
  }
}
