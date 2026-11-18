import { Client } from 'pg';

export function validateTestTarget(connectionString, env = process.env) {
  if (env.SKYRA_ISOLATED_TEST_ENV !== 'true' || !env.ISOLATED_CLUSTER_ID) {
    throw new Error('ISOLATION: explicit test flag and cluster identity are required');
  }
  if (!connectionString) throw new Error('ISOLATION: explicit database URL required');
  let url;
  try { url = new URL(connectionString); }
  catch { throw new Error('ISOLATION: malformed database URL'); }
  const database = decodeURIComponent(url.pathname.slice(1));
  const user = decodeURIComponent(url.username);
  if (url.protocol !== 'postgresql:' || url.hostname !== '127.0.0.1' ||
      !url.port || url.port === '5432' || url.search || url.hash ||
      database !== 'skyra_loghub_disposable_validation' || user !== 'skyra_isolated_user' || !url.password) {
    throw new Error('ISOLATION: unexpected host, port, database, role or URL options');
  }
  return { connectionString, host: url.hostname, port: Number(url.port), database, user };
}

export async function verifyConnectedTarget(client, target, env = process.env) {
  const { rows: [identity] } = await client.query(`SELECT current_database() AS database,
    current_user AS role, host(inet_server_addr()) AS host, inet_server_port() AS port,
    current_setting('server_version_num')::int AS version`);
  if (identity.database !== target.database || identity.role !== target.user ||
      identity.port !== target.port || identity.host !== target.host ||
      identity.version < 170000 || identity.version >= 180000) {
    throw new Error('ISOLATION: live identity differs from the approved PostgreSQL 17 test target');
  }
  const { rows } = await client.query('SELECT cluster_id FROM skyra_test.environment_identity');
  if (rows.length !== 1 || rows[0].cluster_id !== env.ISOLATED_CLUSTER_ID) {
    throw new Error('ISOLATION: unrecognized live cluster marker');
  }
  return identity;
}

export async function connectIsolatedClient(connectionString, env = process.env) {
  const target = validateTestTarget(connectionString, env);
  const client = new Client({ connectionString, connectionTimeoutMillis: 3000,
    query_timeout: 15000, statement_timeout: 12000, application_name: 'skyra-isolated-tests' });
  try {
    await client.connect();
    await verifyConnectedTarget(client, target, env);
    return client;
  } catch (error) { await client.end().catch(() => {}); throw error; }
}

export async function assertIsolatedDatabaseEnvironment(connectionString = process.env.ISOLATED_DATABASE_URL) {
  const client = await connectIsolatedClient(connectionString);
  await client.end();
  return validateTestTarget(connectionString);
}

async function connectVerifiedRuntime(connectionString, env, expectedRole) {
  const url = new URL(connectionString);
  if (decodeURIComponent(url.username) !== expectedRole) throw new Error('ISOLATION: unexpected runtime role');
  const probe = new URL(url); probe.username = 'skyra_isolated_user';
  const target = { ...validateTestTarget(probe.href, env), user: expectedRole, connectionString };
  const client = new Client({ connectionString, connectionTimeoutMillis: 3000, query_timeout: 15000, statement_timeout: 12000 });
  try { await client.connect(); await verifyConnectedTarget(client, target, env); return client; }
  catch(error) { await client.end().catch(()=>{}); throw error; }
}

export function connectIsolatedRuntimeClient(connectionString,env=process.env){return connectVerifiedRuntime(connectionString,env,'skyra_org_runtime');}
export function connectIsolatedIngestionRuntimeClient(connectionString,env=process.env){return connectVerifiedRuntime(connectionString,env,'skyra_ingestion_runtime');}

export function connectIsolatedSessionRuntimeClient(connectionString,env=process.env){return connectVerifiedRuntime(connectionString,env,'skyra_bff_sessions_runtime');}
export function connectIsolatedQueryRuntimeClient(connectionString,env=process.env){return connectVerifiedRuntime(connectionString,env,'skyra_query_runtime');}
