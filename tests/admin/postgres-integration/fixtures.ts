import { Client, Pool } from 'pg';
import { assertIsolatedDatabaseEnvironment } from './guard.js';

export const TEST_DATABASE_URL =
  process.env.ISOLATED_DATABASE_URL ??
  'postgresql://skyra_isolated_user@127.0.0.1:5433/skyra_loghub_disposable_validation';

export function getTestPool(): Pool {
  return new Pool({ connectionString: TEST_DATABASE_URL, max: 10 });
}

export async function getTestClient(): Promise<Client> {
  const target = await assertIsolatedDatabaseEnvironment(TEST_DATABASE_URL);
  const client = new Client({ connectionString: target.connectionString });
  await client.connect();
  return client;
}

export interface SyntheticFixtureData {
  tenantAId: string;
  tenantBId: string;
  projectAId: string;
  projectBId: string;
  userAId: string;
  userBId: string;
  ownerRoleId: string;
  adminRoleId: string;
}

export const STANDARD_ROLES = [
  { name: 'OrgOwner', desc: 'Full tenant organization owner' },
  { name: 'OrgAdmin', desc: 'Organization administrator' },
  { name: 'ProjectAdmin', desc: 'Project scoped administrator' },
  { name: 'Developer', desc: 'Application developer' },
  { name: 'Viewer', desc: 'Read-only analyst viewer' },
];

export const STANDARD_PERMISSIONS = [
  'tenant.read', 'tenant.update', 'tenant.delete',
  'project.create', 'project.read', 'project.update', 'project.delete',
  'member.read', 'member.invite', 'member.update', 'member.remove',
  'role.assign',
  'credentials.create', 'credentials.read', 'credentials.revoke',
  'quotas.manage',
  'retention.manage',
  'logs.ingest', 'logs.search', 'logs.export',
  'audit.read',
  'alerts.manage'
];

/**
 * Seeds standard roles and capabilities into the isolated database.
 */
export async function seedStandardRolesAndPermissions(client: Client): Promise<Map<string, string>> {
  const roleIdMap = new Map<string, string>();

  for (const role of STANDARD_ROLES) {
    const res = await client.query(
      `INSERT INTO roles (name, description, is_system)
       VALUES ($1, $2, true)
       ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
       RETURNING id, name`,
      [role.name, role.desc]
    );
    roleIdMap.set(res.rows[0].name, res.rows[0].id);
  }

  for (const code of STANDARD_PERMISSIONS) {
    await client.query(
      `INSERT INTO permissions (code, description)
       VALUES ($1, $2)
       ON CONFLICT (code) DO NOTHING`,
      [code, `Permission for ${code}`]
    );
  }

  // Grant all permissions to OrgOwner
  const ownerRoleId = roleIdMap.get('OrgOwner');
  if (ownerRoleId) {
    await client.query(
      `INSERT INTO role_permissions (role_id, permission_id)
       SELECT $1, id FROM permissions
       ON CONFLICT DO NOTHING`,
      [ownerRoleId]
    );
  }

  return roleIdMap;
}

/**
 * Creates controlled synthetic fixtures: Tenant A, Tenant B, Project A (Tenant A), Project B (Tenant B), User A, User B.
 */
export async function setupSyntheticFixtures(client: Client): Promise<SyntheticFixtureData> {
  await seedStandardRolesAndPermissions(client);

  const suffix = Math.random().toString(36).substring(2, 9);

  // 1. Create Tenant A & Tenant B
  const tARes = await client.query(
    `INSERT INTO tenants (code, name, status, updated_at) 
     VALUES ($1, 'Synthetic Tenant A', 'ACTIVE', NOW()) 
     RETURNING id`,
    [`synth-t-a-${suffix}`]
  );
  const tenantAId = tARes.rows[0].id;

  const tBRes = await client.query(
    `INSERT INTO tenants (code, name, status, updated_at) 
     VALUES ($1, 'Synthetic Tenant B', 'ACTIVE', NOW()) 
     RETURNING id`,
    [`synth-t-b-${suffix}`]
  );
  const tenantBId = tBRes.rows[0].id;

  // 2. Create Project A (Tenant A) & Project B (Tenant B)
  const projectAId = `proj-a-${suffix}`;
  await client.query(
    `INSERT INTO projects (id, tenant_id, name, status, updated_at)
     VALUES ($1, $2, 'Synthetic Project A', 'ACTIVE', NOW())`,
    [projectAId, tenantAId]
  );

  const projectBId = `proj-b-${suffix}`;
  await client.query(
    `INSERT INTO projects (id, tenant_id, name, status, updated_at)
     VALUES ($1, $2, 'Synthetic Project B', 'ACTIVE', NOW())`,
    [projectBId, tenantBId]
  );

  // 3. Create User A & User B
  const uARes = await client.query(
    `INSERT INTO users (issuer, subject, email, display_name, status)
     VALUES ('https://accounts.google.com', $1, $2, 'Alice Synthetic', 'ACTIVE')
     RETURNING id`,
    [`sub-alice-${suffix}`, `alice-${suffix}@synthetic.internal`]
  );
  const userAId = uARes.rows[0].id;

  const uBRes = await client.query(
    `INSERT INTO users (issuer, subject, email, display_name, status)
     VALUES ('https://accounts.google.com', $1, $2, 'Bob Synthetic', 'ACTIVE')
     RETURNING id`,
    [`sub-bob-${suffix}`, `bob-${suffix}@synthetic.internal`]
  );
  const userBId = uBRes.rows[0].id;

  const roleRes = await client.query(`SELECT id, name FROM roles WHERE name IN ('OrgOwner', 'OrgAdmin')`);
  const ownerRoleId = roleRes.rows.find((r) => r.name === 'OrgOwner')!.id;
  const adminRoleId = roleRes.rows.find((r) => r.name === 'OrgAdmin')!.id;

  return {
    tenantAId,
    tenantBId,
    projectAId,
    projectBId,
    userAId,
    userBId,
    ownerRoleId,
    adminRoleId,
  };
}

/**
 * Cleans up synthetic data created during test runs.
 */
export async function cleanupSyntheticFixtures(client: Client, data?: Partial<SyntheticFixtureData>): Promise<void> {
  if (data?.tenantAId) {
    await client.query(`DELETE FROM tenants WHERE id = $1`, [data.tenantAId]);
  }
  if (data?.tenantBId) {
    await client.query(`DELETE FROM tenants WHERE id = $1`, [data.tenantBId]);
  }
  if (data?.userAId) {
    await client.query(`DELETE FROM users WHERE id = $1`, [data.userAId]);
  }
  if (data?.userBId) {
    await client.query(`DELETE FROM users WHERE id = $1`, [data.userBId]);
  }
}
