/**
 * SKYRA LOGHUB — Q-06D
 * LIVE RETENTION POLICY INTEGRATION, DATABASE MIGRATION & SECURITY ACCEPTANCE
 *
 * Exercises real PostgreSQL 17 disposable database and Admin Service persistence
 * across migration application, CRUD operations, connection durability, check constraints,
 * cross-tenant isolation, archived project immutability, legal-hold authorization,
 * transactional audit logging, atomic rollback, and concurrent advisory locking.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { root, readState, testEnvironment } from '../../scripts/isolated-postgres.mjs';
import { connectIsolatedClient, validateTestTarget } from '../../scripts/lib/isolated-target.mjs';
import { AdminConfigService } from '../../apps/admin-service/dist/core/config/admin-config.service.js';
import { adminPrisma } from '../../apps/admin-service/dist/core/database/admin-prisma.js';
import { ProjectsService } from '../../apps/admin-service/dist/modules/projects/projects.service.js';
import { RetentionService } from '../../apps/admin-service/dist/modules/projects/retention.service.js';
import { RetentionController } from '../../apps/admin-service/dist/api/controllers/retention.controller.js';
import { EffectivePermissionResolver } from '../../apps/admin-service/dist/modules/authorization/application/effective-permission.resolver.js';

const STANDARD_ROLES = [
  { name: 'OrgOwner', desc: 'Full tenant organization owner' },
  { name: 'OrgAdmin', desc: 'Organization administrator' },
  { name: 'ProjectAdmin', desc: 'Project scoped administrator' },
  { name: 'Developer', desc: 'Application developer' },
  { name: 'Viewer', desc: 'Read-only analyst viewer' },
];

async function ensurePrerequisiteSchema(client) {
  const { rows } = await client.query("SELECT to_regclass('public.projects') as exists");
  if (!rows[0].exists) {
    const files = [
      'apps/ingestion-gateway/prisma/migrations/20261024000000_init_metadata/migration.sql',
      'docs/admin/migrations/ADMIN-002/migration.sql',
      'docs/admin/migrations/FEATURE-001A-001/migration.sql',
      'docs/admin/migrations/FEATURE-001B-001/migration.sql',
      'docs/admin/migrations/FEATURE-002-001/migration.sql',
      'docs/admin/migrations/FEATURE-003-001/migration.sql',
    ];
    for (const f of files) {
      const sql = fs.readFileSync(path.join(root, f), 'utf8');
      await client.query(sql);
    }
  }

  const { rows: retRows } = await client.query("SELECT to_regclass('public.project_retention_policies') as exists");
  if (!retRows[0].exists) {
    const sql = fs.readFileSync(path.join(root, 'docs/admin/migrations/FEATURE-010-001/migration.sql'), 'utf8');
    await client.query(sql);
  }
}

async function seedRoles(client) {
  for (const role of STANDARD_ROLES) {
    await client.query(
      `INSERT INTO roles (name, description, is_system)
       VALUES ($1, $2, true)
       ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description`,
      [role.name, role.desc]
    );
  }
}

test('Q-06D: Live Retention Policy Integration, PostgreSQL Persistence & Security Acceptance', async (t) => {
  const env = process.env.ISOLATED_DATABASE_URL ? process.env : testEnvironment();
  const owner = await connectIsolatedClient(env.ISOLATED_DATABASE_URL, env);

  // 1. Ensure schema and migration
  await ensurePrerequisiteSchema(owner);
  await seedRoles(owner);

  // 2. Setup isolated synthetic fixtures
  const suffix = crypto.randomUUID().slice(0, 8);
  const issuer = 'https://accounts.google.com';

  // Tenants
  const tenantARes = await owner.query(
    `INSERT INTO tenants (code, name, status, updated_at)
     VALUES ($1, $2, 'ACTIVE', now()) RETURNING id`,
    [`tenant-ret-a-${suffix}`, `Tenant A Retention ${suffix}`]
  );
  const tenantA = tenantARes.rows[0].id;

  const tenantBRes = await owner.query(
    `INSERT INTO tenants (code, name, status, updated_at)
     VALUES ($1, $2, 'ACTIVE', now()) RETURNING id`,
    [`tenant-ret-b-${suffix}`, `Tenant B Retention ${suffix}`]
  );
  const tenantB = tenantBRes.rows[0].id;

  // Projects in Tenant A
  const projectA1 = `proj-ret-a1-${suffix}`;
  await owner.query(
    `INSERT INTO projects (id, tenant_id, name, status, updated_at)
     VALUES ($1, $2, 'Active Retention Project', 'ACTIVE', now())`,
    [projectA1, tenantA]
  );

  const projectA2_Archived = `proj-ret-a2-${suffix}`;
  await owner.query(
    `INSERT INTO projects (id, tenant_id, name, status, updated_at)
     VALUES ($1, $2, 'Archived Retention Project', 'ARCHIVED', now())`,
    [projectA2_Archived, tenantA]
  );

  // Project in Tenant B
  const projectB1 = `proj-ret-b1-${suffix}`;
  await owner.query(
    `INSERT INTO projects (id, tenant_id, name, status, updated_at)
     VALUES ($1, $2, 'Tenant B Retention Project', 'ACTIVE', now())`,
    [projectB1, tenantB]
  );

  // Users in Tenant A
  // 1. Alice: OrgOwner (has retention.manage, retention.read, tenant.update)
  const aliceRes = await owner.query(
    `INSERT INTO users (issuer, subject, email, display_name, status)
     VALUES ($1, $2, $3, 'Alice Owner', 'ACTIVE') RETURNING id`,
    [issuer, `alice-sub-${suffix}`, `alice-${suffix}@test.invalid`]
  );
  const aliceId = aliceRes.rows[0].id;
  await owner.query(
    `INSERT INTO tenant_memberships (tenant_id, user_id, status) VALUES ($1, $2, 'ACTIVE')`,
    [tenantA, aliceId]
  );
  await owner.query(
    `INSERT INTO role_assignments (tenant_id, user_id, role_id)
     SELECT $1, $2, id FROM roles WHERE name = 'OrgOwner'`,
    [tenantA, aliceId]
  );

  // 2. Bob: OrgAdmin (has retention.read, but lacks retention.manage)
  const bobRes = await owner.query(
    `INSERT INTO users (issuer, subject, email, display_name, status)
     VALUES ($1, $2, $3, 'Bob Admin', 'ACTIVE') RETURNING id`,
    [issuer, `bob-sub-${suffix}`, `bob-${suffix}@test.invalid`]
  );
  const bobId = bobRes.rows[0].id;
  await owner.query(
    `INSERT INTO tenant_memberships (tenant_id, user_id, status) VALUES ($1, $2, 'ACTIVE')`,
    [tenantA, bobId]
  );
  await owner.query(
    `INSERT INTO role_assignments (tenant_id, user_id, role_id)
     SELECT $1, $2, id FROM roles WHERE name = 'OrgAdmin'`,
    [tenantA, bobId]
  );

  // 3. Charlie: ProjectAdmin on projectA1 (has retention.read on projectA1, lacks retention.manage)
  const charlieRes = await owner.query(
    `INSERT INTO users (issuer, subject, email, display_name, status)
     VALUES ($1, $2, $3, 'Charlie ProjectAdmin', 'ACTIVE') RETURNING id`,
    [issuer, `charlie-sub-${suffix}`, `charlie-${suffix}@test.invalid`]
  );
  const charlieId = charlieRes.rows[0].id;
  await owner.query(
    `INSERT INTO tenant_memberships (tenant_id, user_id, status) VALUES ($1, $2, 'ACTIVE')`,
    [tenantA, charlieId]
  );
  await owner.query(
    `INSERT INTO project_memberships (tenant_id, user_id, project_id, status) VALUES ($1, $2, $3, 'ACTIVE')`,
    [tenantA, charlieId, projectA1]
  );
  await owner.query(
    `INSERT INTO role_assignments (tenant_id, user_id, role_id, project_id)
     SELECT $1, $2, id, $3 FROM roles WHERE name = 'ProjectAdmin'`,
    [tenantA, charlieId, projectA1]
  );

  // 4. Dave: Viewer in Tenant A (lacks retention.read and retention.manage)
  const daveRes = await owner.query(
    `INSERT INTO users (issuer, subject, email, display_name, status)
     VALUES ($1, $2, $3, 'Dave Viewer', 'ACTIVE') RETURNING id`,
    [issuer, `dave-sub-${suffix}`, `dave-${suffix}@test.invalid`]
  );
  const daveId = daveRes.rows[0].id;
  await owner.query(
    `INSERT INTO tenant_memberships (tenant_id, user_id, status) VALUES ($1, $2, 'ACTIVE')`,
    [tenantA, daveId]
  );
  await owner.query(
    `INSERT INTO role_assignments (tenant_id, user_id, role_id)
     SELECT $1, $2, id FROM roles WHERE name = 'Viewer'`,
    [tenantA, daveId]
  );

  // 5. Eve: OrgOwner in Tenant B (cross-tenant principal)
  const eveRes = await owner.query(
    `INSERT INTO users (issuer, subject, email, display_name, status)
     VALUES ($1, $2, $3, 'Eve Owner B', 'ACTIVE') RETURNING id`,
    [issuer, `eve-sub-${suffix}`, `eve-${suffix}@test.invalid`]
  );
  const eveId = eveRes.rows[0].id;
  await owner.query(
    `INSERT INTO tenant_memberships (tenant_id, user_id, status) VALUES ($1, $2, 'ACTIVE')`,
    [tenantB, eveId]
  );
  await owner.query(
    `INSERT INTO role_assignments (tenant_id, user_id, role_id)
     SELECT $1, $2, id FROM roles WHERE name = 'OrgOwner'`,
    [tenantB, eveId]
  );

  // Helper principal generators with precise scope matching
  const aliceRead = {
    sub: `alice-sub-${suffix}`,
    identityIssuer: issuer,
    tenantId: tenantA,
    scope: 'retention.read',
    roles: ['OrgOwner'],
    capabilities: ['retention.manage', 'retention.read', 'tenant.update', 'projects.read'],
  };

  const aliceWrite = {
    sub: `alice-sub-${suffix}`,
    identityIssuer: issuer,
    tenantId: tenantA,
    scope: 'retention.manage',
    roles: ['OrgOwner'],
    capabilities: ['retention.manage', 'retention.read', 'tenant.update', 'projects.read'],
  };

  const bobRead = {
    sub: `bob-sub-${suffix}`,
    identityIssuer: issuer,
    tenantId: tenantA,
    scope: 'retention.read',
    roles: ['OrgAdmin'],
    capabilities: ['retention.read', 'projects.read'],
  };

  const bobWrite = {
    sub: `bob-sub-${suffix}`,
    identityIssuer: issuer,
    tenantId: tenantA,
    scope: 'retention.manage',
    roles: ['OrgAdmin'],
    capabilities: ['retention.read', 'projects.read'],
  };

  const charlieRead = {
    sub: `charlie-sub-${suffix}`,
    identityIssuer: issuer,
    tenantId: tenantA,
    scope: 'retention.read',
    roles: ['ProjectAdmin'],
    capabilities: ['retention.read', 'projects.read'],
  };

  const charlieWrite = {
    sub: `charlie-sub-${suffix}`,
    identityIssuer: issuer,
    tenantId: tenantA,
    scope: 'retention.manage',
    roles: ['ProjectAdmin'],
    capabilities: ['retention.read', 'projects.read'],
  };

  const daveRead = {
    sub: `dave-sub-${suffix}`,
    identityIssuer: issuer,
    tenantId: tenantA,
    scope: 'retention.read',
    roles: ['Viewer'],
    capabilities: ['projects.read', 'logs.search'],
  };

  const daveWrite = {
    sub: `dave-sub-${suffix}`,
    identityIssuer: issuer,
    tenantId: tenantA,
    scope: 'retention.manage',
    roles: ['Viewer'],
    capabilities: ['projects.read', 'logs.search'],
  };

  const eveRead = {
    sub: `eve-sub-${suffix}`,
    identityIssuer: issuer,
    tenantId: tenantB,
    scope: 'retention.read',
    roles: ['OrgOwner'],
    capabilities: ['retention.manage', 'retention.read', 'tenant.update', 'projects.read'],
  };

  const eveWrite = {
    sub: `eve-sub-${suffix}`,
    identityIssuer: issuer,
    tenantId: tenantB,
    scope: 'retention.manage',
    roles: ['OrgOwner'],
    capabilities: ['retention.manage', 'retention.read', 'tenant.update', 'projects.read'],
  };

  const config = new AdminConfigService({
    ADMIN_PERSISTENCE_ENABLED: 'true',
    DATABASE_URL: env.ISOLATED_DATABASE_URL,
    TRUSTED_OIDC_ISSUERS: issuer,
    INTERNAL_JWT_SECRET: 'skyra-internal-admin-shared-secret-key-32chars!',
  });

  const resolver = new EffectivePermissionResolver();
  const projectsService = new ProjectsService(config, resolver);
  const retentionService = new RetentionService(config, projectsService);
  const retentionController = new RetentionController(retentionService, config);

  const errorStatus = (code) => (e) => (e.getStatus?.() ?? e.statusCode ?? e.status) === code;

  try {
    // ------------------------------------------------------------------------
    // REQ 1 & 2: Database Migration & Schema Constraints Parity
    // ------------------------------------------------------------------------
    await t.test('1 & 2. Migration creates project_retention_policies table with expected schema and constraints', async () => {
      const tableCheck = await owner.query(
        "SELECT table_name FROM information_schema.tables WHERE table_name = 'project_retention_policies' AND table_schema = 'public'"
      );
      assert.equal(tableCheck.rows.length, 1, 'Table project_retention_policies must exist');

      const cols = await owner.query(
        "SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = 'project_retention_policies' ORDER BY ordinal_position"
      );
      const colMap = new Map(cols.rows.map(c => [c.column_name, c]));
      assert.ok(colMap.has('id'));
      assert.ok(colMap.has('tenant_id'));
      assert.ok(colMap.has('project_id'));
      assert.ok(colMap.has('retention_days'));
      assert.ok(colMap.has('enable_parquet_purge'));
      assert.ok(colMap.has('is_legal_hold'));
      assert.ok(colMap.has('created_at'));
      assert.ok(colMap.has('updated_at'));

      const constraints = await owner.query(
        "SELECT conname, contype, pg_get_constraintdef(oid) as def FROM pg_constraint WHERE conrelid = 'project_retention_policies'::regclass"
      );
      const conNames = constraints.rows.map(c => c.conname);
      assert.ok(conNames.includes('project_retention_policies_pkey'), 'Primary key must exist');
      assert.ok(conNames.includes('project_retention_tenant_project_key'), 'Unique (tenant_id, project_id) must exist');
      assert.ok(conNames.includes('project_retention_tenant_project_fkey'), 'Composite FK to projects(tenant_id, id) must exist');
      assert.ok(conNames.includes('project_retention_policies_retention_days_check'), 'CHECK constraint for retention_days must exist');
    });

    // ------------------------------------------------------------------------
    // REQ 3: Default Retention Behavior (30 days, purge enabled, no legal hold)
    // ------------------------------------------------------------------------
    await t.test('3. Default retention behavior returns 30 days when no policy row exists without persisting', async () => {
      const policy = await retentionService.read(aliceRead, tenantA, projectA1);
      assert.equal(policy.tenantId, tenantA);
      assert.equal(policy.projectId, projectA1);
      assert.equal(policy.retentionDays, 30);
      assert.equal(policy.enableParquetPurge, true);
      assert.equal(policy.isLegalHold, false);
      assert.match(policy.id, /^[a-f0-9-]{36}$/);

      // Verify no row was inserted into the database on read
      const { rows } = await owner.query(
        'SELECT count(*)::int as count FROM project_retention_policies WHERE tenant_id = $1 AND project_id = $2',
        [tenantA, projectA1]
      );
      assert.equal(rows[0].count, 0, 'Read must not insert row into database');
    });

    // ------------------------------------------------------------------------
    // REQ 4: First PATCH Persists a New Policy Row
    // ------------------------------------------------------------------------
    let initialPolicy;
    await t.test('4. First PATCH persists a new policy row with real timestamps in PostgreSQL', async () => {
      const corrId = 'corr-patch-first-' + crypto.randomUUID();
      const updated = await retentionService.update(
        aliceWrite,
        tenantA,
        projectA1,
        { retentionDays: 90 },
        corrId
      );

      assert.equal(updated.retentionDays, 90);
      assert.equal(updated.enableParquetPurge, true);
      assert.equal(updated.isLegalHold, false);
      initialPolicy = updated;

      // Verify row exists in PostgreSQL
      const { rows } = await owner.query(
        'SELECT * FROM project_retention_policies WHERE tenant_id = $1 AND project_id = $2',
        [tenantA, projectA1]
      );
      assert.equal(rows.length, 1, 'Policy row must be persisted in PostgreSQL');
      assert.equal(rows[0].retention_days, 90);
      assert.equal(rows[0].enable_parquet_purge, true);
      assert.equal(rows[0].is_legal_hold, false);
      assert.equal(rows[0].id, updated.id);
    });

    // ------------------------------------------------------------------------
    // REQ 5: Subsequent GET Returns the Exact Persisted Policy
    // ------------------------------------------------------------------------
    await t.test('5. Subsequent GET returns the exact persisted policy from PostgreSQL', async () => {
      const policy = await retentionService.read(aliceRead, tenantA, projectA1);
      assert.equal(policy.id, initialPolicy.id);
      assert.equal(policy.retentionDays, 90);
      assert.equal(policy.enableParquetPurge, true);
      assert.equal(policy.isLegalHold, false);
      assert.equal(policy.updatedAt, initialPolicy.updatedAt);
    });

    // ------------------------------------------------------------------------
    // REQ 6: Updates Preserve Omitted Fields
    // ------------------------------------------------------------------------
    await t.test('6. Updates preserve omitted fields (partial update semantics)', async () => {
      const corrId = 'corr-patch-partial-' + crypto.randomUUID();
      const updated = await retentionService.update(
        aliceWrite,
        tenantA,
        projectA1,
        { enableParquetPurge: false },
        corrId
      );

      assert.equal(updated.retentionDays, 90, 'retentionDays must be preserved at 90');
      assert.equal(updated.enableParquetPurge, false, 'enableParquetPurge must be updated to false');
      assert.equal(updated.isLegalHold, false, 'isLegalHold must be preserved at false');

      const { rows } = await owner.query(
        'SELECT * FROM project_retention_policies WHERE tenant_id = $1 AND project_id = $2',
        [tenantA, projectA1]
      );
      assert.equal(rows[0].retention_days, 90);
      assert.equal(rows[0].enable_parquet_purge, false);
      assert.equal(rows[0].is_legal_hold, false);
    });

    // ------------------------------------------------------------------------
    // REQ 7: Repeated PATCH Behaves Correctly (Idempotent / Advances Timestamps)
    // ------------------------------------------------------------------------
    await t.test('7. Repeated PATCH updates cleanly and advances updatedAt timestamp', async () => {
      const before = await retentionService.read(aliceRead, tenantA, projectA1);
      // Small sleep to ensure distinct microsecond timestamp
      await new Promise(r => setTimeout(r, 20));

      const corrId = 'corr-patch-repeated-' + crypto.randomUUID();
      const after = await retentionService.update(
        aliceWrite,
        tenantA,
        projectA1,
        { retentionDays: 180 },
        corrId
      );

      assert.equal(after.retentionDays, 180);
      assert.equal(after.enableParquetPurge, false);
      assert.ok(new Date(after.updatedAt) >= new Date(before.updatedAt));
    });

    // ------------------------------------------------------------------------
    // REQ 8: Changes Survive Disconnect and Reconnect (Durable Persistence)
    // ------------------------------------------------------------------------
    await t.test('8. Changes survive closing and reopening database connection', async () => {
      // Disconnect Prisma
      await adminPrisma(config).$disconnect();

      // Open brand new direct connection
      const freshClient = await connectIsolatedClient(env.ISOLATED_DATABASE_URL, env);
      try {
        const { rows } = await freshClient.query(
          'SELECT retention_days, enable_parquet_purge, is_legal_hold FROM project_retention_policies WHERE tenant_id = $1 AND project_id = $2',
          [tenantA, projectA1]
        );
        assert.equal(rows.length, 1);
        assert.equal(rows[0].retention_days, 180);
        assert.equal(rows[0].enable_parquet_purge, false);
        assert.equal(rows[0].is_legal_hold, false);
      } finally {
        await freshClient.end();
      }

      // Re-read via service with fresh Prisma connection
      const freshPolicy = await retentionService.read(aliceRead, tenantA, projectA1);
      assert.equal(freshPolicy.retentionDays, 180);
      assert.equal(freshPolicy.enableParquetPurge, false);
    });

    // ------------------------------------------------------------------------
    // REQ 9: Input Validation Rejects Invalid Retention Durations
    // ------------------------------------------------------------------------
    await t.test('9. Input validation rejects invalid retention durations (0, 366, negative, float, unknown fields)', async () => {
      const corrId = 'corr-invalid-input';
      for (const invalid of [
        { retentionDays: 0 },
        { retentionDays: 366 },
        { retentionDays: -10 },
        { retentionDays: 30.5 },
        { retentionDays: '30' },
        { enableParquetPurge: 'true' },
        { isLegalHold: 1 },
        { unknownProperty: true },
        {},
      ]) {
        await assert.rejects(
          retentionService.update(aliceWrite, tenantA, projectA1, invalid, corrId),
          errorStatus(400),
          `Should reject input: ${JSON.stringify(invalid)}`
        );
      }
    });

    // ------------------------------------------------------------------------
    // REQ 10: Database CHECK Constraint Independently Rejects Invalid Stored Values
    // ------------------------------------------------------------------------
    await t.test('10. Database CHECK constraint independently rejects invalid stored values (error code 23514)', async () => {
      // Direct raw SQL insert violating retention_days BETWEEN 1 AND 365
      await assert.rejects(
        owner.query(
          'INSERT INTO project_retention_policies (tenant_id, project_id, retention_days) VALUES ($1, $2, 0)',
          [tenantA, `temp-proj-${suffix}`]
        ),
        (err) => err.code === '23514',
        'Database must throw check_violation (23514) on retention_days = 0'
      );

      await assert.rejects(
        owner.query(
          'INSERT INTO project_retention_policies (tenant_id, project_id, retention_days) VALUES ($1, $2, 366)',
          [tenantA, `temp-proj-${suffix}`]
        ),
        (err) => err.code === '23514',
        'Database must throw check_violation (23514) on retention_days = 366'
      );

      await assert.rejects(
        owner.query(
          'UPDATE project_retention_policies SET retention_days = -5 WHERE project_id = $1',
          [projectA1]
        ),
        (err) => err.code === '23514',
        'Database must throw check_violation (23514) on retention_days = -5'
      );
    });

    // ------------------------------------------------------------------------
    // REQ 11: Cross-Tenant Isolation
    // ------------------------------------------------------------------------
    await t.test('11. Cross-tenant reads and writes are denied fail-closed without disclosure', async () => {
      // Alice (Tenant A) attempts to read Project B1 (Tenant B) under own tenant context
      await assert.rejects(
        retentionService.read(aliceRead, tenantA, projectB1),
        errorStatus(404),
        'Cross-tenant project lookup under own tenant context must return 404'
      );

      // Alice (Tenant A) attempts to read Project B1 under Tenant B context (tenant mismatch)
      await assert.rejects(
        retentionService.read(aliceRead, tenantB, projectB1),
        errorStatus(403),
        'Forged tenantId context mismatch must return 403 Forbidden'
      );

      // Alice (Tenant A) attempts to update Project B1 under own tenant context
      await assert.rejects(
        retentionService.update(aliceWrite, tenantA, projectB1, { retentionDays: 60 }, 'corr-cross'),
        errorStatus(404),
        'Cross-tenant update must return 404'
      );

      // Eve (Tenant B) attempts to read Project A1 (Tenant A) under own tenant context
      await assert.rejects(
        retentionService.read(eveRead, tenantB, projectA1),
        errorStatus(404),
        'Tenant B user reading Tenant A project must return 404'
      );

      // Direct database composite foreign key enforces tenant-project binding
      await assert.rejects(
        owner.query(
          'INSERT INTO project_retention_policies (tenant_id, project_id, retention_days) VALUES ($1, $2, 30)',
          [tenantA, projectB1]
        ),
        (err) => err.code === '23503',
        'Direct SQL inserting mismatched (tenantA, projectB1) must fail composite FK'
      );
    });

    // ------------------------------------------------------------------------
    // REQ 12: Archived Projects Immutability (409 Conflict)
    // ------------------------------------------------------------------------
    await t.test('12. Archived projects cannot have retention policy modified (409 Conflict)', async () => {
      // Reading archived project is allowed
      const archivedPolicy = await retentionService.read(aliceRead, tenantA, projectA2_Archived);
      assert.equal(archivedPolicy.retentionDays, 30);

      // Modifying archived project retention policy is rejected with 409
      await assert.rejects(
        retentionService.update(
          aliceWrite,
          tenantA,
          projectA2_Archived,
          { retentionDays: 60 },
          'corr-archived'
        ),
        errorStatus(409),
        'Archived project retention policy modification must return 409 Conflict'
      );
    });

    // ------------------------------------------------------------------------
    // REQ 13: Legal-Hold Activation Authorization
    // ------------------------------------------------------------------------
    await t.test('13. Legal-hold activation succeeds with authorized OrgOwner and denies unauthorized roles', async () => {
      // Bob (OrgAdmin) lacks retention.manage -> 403
      await assert.rejects(
        retentionService.update(bobWrite, tenantA, projectA1, { isLegalHold: true }, 'corr-bob-lh'),
        errorStatus(403),
        'OrgAdmin lacking retention.manage must be rejected with 403'
      );

      // Charlie (ProjectAdmin) lacks retention.manage -> 403
      await assert.rejects(
        retentionService.update(charlieWrite, tenantA, projectA1, { isLegalHold: true }, 'corr-charlie-lh'),
        errorStatus(403),
        'ProjectAdmin lacking retention.manage must be rejected with 403'
      );

      // Dave (Viewer) lacks retention.manage and projects.read -> 403
      await assert.rejects(
        retentionService.update(daveWrite, tenantA, projectA1, { isLegalHold: true }, 'corr-dave-lh'),
        errorStatus(403),
        'Viewer must be rejected with 403'
      );

      // Alice (OrgOwner) sets isLegalHold: true -> succeeds
      const withLegalHold = await retentionService.update(
        aliceWrite,
        tenantA,
        projectA1,
        { isLegalHold: true },
        'corr-legal-hold-on'
      );
      assert.equal(withLegalHold.isLegalHold, true);

      const { rows } = await owner.query(
        'SELECT is_legal_hold FROM project_retention_policies WHERE tenant_id = $1 AND project_id = $2',
        [tenantA, projectA1]
      );
      assert.equal(rows[0].is_legal_hold, true);
    });

    // ------------------------------------------------------------------------
    // REQ 14: Legal-Hold Removal Restricted to OrgOwner Authority
    // ------------------------------------------------------------------------
    await t.test('14. Legal-hold removal requires elevated OrgOwner authority', async () => {
      // Bob (OrgAdmin) attempts to release legal hold -> 403
      await assert.rejects(
        retentionService.update(bobWrite, tenantA, projectA1, { isLegalHold: false }, 'corr-bob-release'),
        errorStatus(403),
        'Non-owner attempting to release legal hold must be rejected with 403'
      );

      // Alice (OrgOwner) releases legal hold -> succeeds
      const released = await retentionService.update(
        aliceWrite,
        tenantA,
        projectA1,
        { isLegalHold: false },
        'corr-alice-release'
      );
      assert.equal(released.isLegalHold, false);

      const { rows } = await owner.query(
        'SELECT is_legal_hold FROM project_retention_policies WHERE tenant_id = $1 AND project_id = $2',
        [tenantA, projectA1]
      );
      assert.equal(rows[0].is_legal_hold, false);
    });

    // ------------------------------------------------------------------------
    // REQ 15: Audit Records Written Transactionally
    // ------------------------------------------------------------------------
    await t.test('15. Audit records are written transactionally in admin_audit_events table', async () => {
      const corrId = 'corr-audit-verify-' + crypto.randomUUID();
      await retentionService.update(
        aliceWrite,
        tenantA,
        projectA1,
        { retentionDays: 45 },
        corrId
      );

      const { rows } = await owner.query(
        "SELECT * FROM admin_audit_events WHERE tenant_id = $1 AND target_type = 'retention' AND target_id = $2 AND details->>'correlationId' = $3",
        [tenantA, projectA1, corrId]
      );

      assert.equal(rows.length, 1, 'Exactly one audit record must be written for the operation');
      const audit = rows[0];
      assert.equal(audit.action, 'RETENTION_POLICY_CHANGED');
      assert.equal(audit.target_type, 'retention');
      assert.equal(audit.target_id, projectA1);
      assert.equal(audit.actor_user_id, aliceId);
      assert.equal(audit.actor_email, `alice-${suffix}@test.invalid`);
      assert.equal(audit.details.outcome, 'SUCCESS');
      assert.equal(audit.details.after.retentionDays, 45);
      assert.ok(audit.details.before, 'details.before must capture previous policy state');
    });

    // ------------------------------------------------------------------------
    // REQ 16: Atomic Rollback on Failure (No Partial Writes)
    // ------------------------------------------------------------------------
    await t.test('16. Failed transactions roll back atomically without partial policy or audit writes', async () => {
      const policyBefore = await retentionService.read(aliceRead, tenantA, projectA1);
      const rollbackCorrId = 'retention-rollback-probe-' + crypto.randomUUID();

      // Install a temporary failure trigger on admin_audit_events
      await owner.query(`
        CREATE OR REPLACE FUNCTION public.reject_retention_audit() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW.details->>'correlationId' = '${rollbackCorrId}' THEN
            RAISE EXCEPTION 'controlled retention audit failure for rollback verification';
          END IF;
          RETURN NEW;
        END $$;
      `);
      await owner.query(`
        CREATE TRIGGER retention_audit_failure_trigger
        BEFORE INSERT ON admin_audit_events
        FOR EACH ROW EXECUTE FUNCTION public.reject_retention_audit();
      `);

      try {
        await assert.rejects(
          retentionService.update(
            aliceWrite,
            tenantA,
            projectA1,
            { retentionDays: 250 },
            rollbackCorrId
          ),
          /AuditPersistenceException|controlled retention audit failure/
        );
      } finally {
        await owner.query('DROP TRIGGER IF EXISTS retention_audit_failure_trigger ON admin_audit_events');
        await owner.query('DROP FUNCTION IF EXISTS public.reject_retention_audit()');
      }

      // Verify that retention policy was rolled back and NOT updated to 250
      const policyAfter = await retentionService.read(aliceRead, tenantA, projectA1);
      assert.equal(policyAfter.retentionDays, policyBefore.retentionDays, 'Retention days must not change after failed transaction');
      assert.equal(policyAfter.updatedAt, policyBefore.updatedAt, 'Timestamps must not advance after failed transaction');

      // Verify no audit row was persisted with the rollback correlation ID
      const { rows } = await owner.query(
        "SELECT count(*)::int as count FROM admin_audit_events WHERE details->>'correlationId' = $1",
        [rollbackCorrId]
      );
      assert.equal(rows[0].count, 0, 'No partial audit record must remain after transaction rollback');
    });

    // ------------------------------------------------------------------------
    // REQ 17: Concurrent Updates Follow Explicit Consistency Policy (Advisory Lock)
    // ------------------------------------------------------------------------
    await t.test('17. Concurrent updates serialize safely via pg_advisory_xact_lock without deadlock or corrupted state', async () => {
      const corr1 = 'concurrent-1-' + crypto.randomUUID();
      const corr2 = 'concurrent-2-' + crypto.randomUUID();

      // Execute two simultaneous updates on the same project
      const results = await Promise.allSettled([
        retentionService.update(aliceWrite, tenantA, projectA1, { retentionDays: 60 }, corr1),
        retentionService.update(aliceWrite, tenantA, projectA1, { retentionDays: 120 }, corr2),
      ]);

      // Both must succeed deterministically due to pg_advisory_xact_lock serialization
      assert.equal(results.filter(r => r.status === 'fulfilled').length, 2, 'Both concurrent updates must succeed');

      // Final state in DB must match one of the updates
      const finalPolicy = await retentionService.read(aliceRead, tenantA, projectA1);
      assert.ok([60, 120].includes(finalPolicy.retentionDays), 'Final retentionDays must be 60 or 120');

      // Exactly two audit events must exist for these two correlation IDs
      const { rows: auditRows } = await owner.query(
        "SELECT details->>'correlationId' as corr, details->'after'->>'retentionDays' as days FROM admin_audit_events WHERE details->>'correlationId' IN ($1, $2) ORDER BY created_at ASC",
        [corr1, corr2]
      );
      assert.equal(auditRows.length, 2, 'Both serialized operations must produce ordered audit events');
    });

    // ------------------------------------------------------------------------
    // REQ 18: Retention Safety Invariants (Zero Storage Deletions)
    // ------------------------------------------------------------------------
    await t.test('18. Retention policy updates never delete physical WAL, JSONL, or Parquet storage files', async () => {
      // Check that updating retention policy does NOT delete or prune any files
      const storageProbeDir = path.join(root, '.tmp', `retention-safety-probe-${suffix}`);
      fs.mkdirSync(storageProbeDir, { recursive: true });
      const testWal = path.join(storageProbeDir, 'wal-001.log');
      const testJsonl = path.join(storageProbeDir, 'events.jsonl');
      const testParquet = path.join(storageProbeDir, 'archive.parquet');

      fs.writeFileSync(testWal, 'wal-data');
      fs.writeFileSync(testJsonl, '{"log":"line"}');
      fs.writeFileSync(testParquet, 'PAR1-mock');

      try {
        // Execute a retention policy update
        await retentionService.update(
          aliceWrite,
          tenantA,
          projectA1,
          { retentionDays: 14, enableParquetPurge: true },
          'corr-safety-invariant'
        );

        // Verify all probe storage files remain untouched
        assert.ok(fs.existsSync(testWal), 'WAL file must NOT be deleted');
        assert.ok(fs.existsSync(testJsonl), 'JSONL file must NOT be deleted');
        assert.ok(fs.existsSync(testParquet), 'Parquet file must NOT be deleted');
      } finally {
        fs.rmSync(storageProbeDir, { recursive: true, force: true });
      }
    });

    // ------------------------------------------------------------------------
    // Controller & Service Boundary Verification (Admin Controller & HTTP Headers)
    // ------------------------------------------------------------------------
    await t.test('Service Boundary: RetentionController handles assertions, caching headers, and correlation IDs', async () => {
      const mockReq = {
        principal: aliceRead,
        headers: { 'x-correlation-id': 'controller-boundary-test' },
      };
      const headersSet = {};
      const mockReply = {
        header: (name, val) => {
          headersSet[name] = val;
          return mockReply;
        },
      };

      const result = await retentionController.getRetention(projectA1, mockReq, mockReply);
      assert.equal(result.projectId, projectA1);
      assert.equal(headersSet['Cache-Control'], 'no-store');
      assert.equal(headersSet['Pragma'], 'no-cache');

      mockReq.principal = aliceWrite;
      const patchResult = await retentionController.patchRetention(
        projectA1,
        { retentionDays: 30 },
        mockReq,
        mockReply
      );
      assert.equal(patchResult.retentionDays, 30);
      assert.equal(headersSet['X-Correlation-ID'], 'controller-boundary-test');
    });

  } finally {
    await adminPrisma(config).$disconnect();
    await owner.end();
  }
});
