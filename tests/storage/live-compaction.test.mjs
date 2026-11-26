/**
 * SKYRA LOGHUB — Q-06E
 * SAFE BACKGROUND STORAGE COMPACTION & PARQUET MATERIALIZATION
 * LIVE POSTGRESQL & DUCKDB INTEGRATION TEST SUITE
 *
 * Exercises real PostgreSQL 17 disposable database, real DuckDB engine, and
 * BackgroundCompactionService across database discovery, advisory lock coordination,
 * Parquet materialization, retention policy inspection, query correctness,
 * and zero-deletion storage safeguards.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { root, readState, testEnvironment } from '../../scripts/isolated-postgres.mjs';
import { connectIsolatedClient, validateTestTarget } from '../../scripts/lib/isolated-target.mjs';
import { DuckDbInstanceManager } from '../../apps/query-service/dist/modules/query-execution/infrastructure/duckdb/duckdb-instance.manager.js';
import { QueryConfigService } from '../../apps/query-service/dist/config/query-config.service.js';
import { QueryAuditService } from '../../apps/query-service/dist/modules/audit/query-audit.service.js';
import { ParquetPathSafetyService } from '../../apps/query-service/dist/modules/parquet-cache/infrastructure/filesystem/parquet-path-safety.service.js';
import { FileParquetCatalogService } from '../../apps/query-service/dist/modules/parquet-cache/infrastructure/catalog/file-parquet-catalog.service.js';
import { DuckDbParquetConverter } from '../../apps/query-service/dist/modules/parquet-cache/infrastructure/duckdb/duckdb-parquet-converter.js';
import { MaterializeSegmentUseCase } from '../../apps/query-service/dist/modules/parquet-cache/application/materialize-segment.use-case.js';
import { RecoverMaterializationUseCase } from '../../apps/query-service/dist/modules/parquet-cache/application/recover-materialization.use-case.js';
import { CompactionLockCoordinatorService } from '../../apps/query-service/dist/modules/parquet-cache/application/compaction-lock-coordinator.service.js';
import { CompactionDiscoveryService } from '../../apps/query-service/dist/modules/parquet-cache/application/compaction-discovery.service.js';
import { BackgroundCompactionService } from '../../apps/query-service/dist/modules/parquet-cache/application/background-compaction.service.js';
import { PathSafetyService } from '../../apps/query-service/dist/modules/archive-discovery/infrastructure/path-safety.service.js';
import { ManifestVerifierService } from '../../apps/query-service/dist/modules/archive-discovery/application/manifest-verifier.service.js';
import { PrismaArchiveSegmentRepository } from '../../apps/query-service/dist/modules/archive-discovery/infrastructure/prisma-archive-segment.repository.js';
import { PrismaService } from '../../apps/query-service/dist/metadata/prisma.service.js';
import { DuckDbLogQueryAdapter } from '../../apps/query-service/dist/modules/query-execution/infrastructure/duckdb/duckdb-query-adapter.js';
import { SqlGeneratorService } from '../../apps/query-service/dist/modules/query-execution/application/sql-generator.service.js';
import { QueryResourceGovernorService } from '../../apps/query-service/dist/modules/query-execution/infrastructure/duckdb/query-resource-governor.service.js';
import { HybridSourcePlannerService } from '../../apps/query-service/dist/modules/parquet-cache/application/hybrid-source-planner.service.js';
import { QueryPlannerService } from '../../apps/query-service/dist/modules/query-execution/application/query-planner.service.js';
import { FilterCompilerService } from '../../apps/query-service/dist/modules/query-execution/application/filter-compiler.service.js';
import { ArchiveDiscoveryService } from '../../apps/query-service/dist/modules/archive-discovery/application/archive-discovery.service.js';

async function ensurePrerequisiteSchema(client) {
  const { rows } = await client.query("SELECT to_regclass('public.archive_segments') as exists");
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

test('Q-06E: Safe Background Storage Compaction & Live PostgreSQL/DuckDB Integration', async (t) => {
  let env;
  try {
    env = process.env.ISOLATED_DATABASE_URL ? process.env : testEnvironment();
  } catch {
    env = null;
  }

  if (!env || !env.ISOLATED_DATABASE_URL) {
    t.skip('Disposable PostgreSQL test target is not provisioned. Skipping live PostgreSQL test.');
    return;
  }

  // 1. Target Guard & Database Connection
  let owner;
  try {
    owner = await connectIsolatedClient(env.ISOLATED_DATABASE_URL, env);
  } catch (err) {
    t.skip(`Disposable PostgreSQL connection failed (${err.message}). Skipping live PostgreSQL test.`);
    return;
  }
  await ensurePrerequisiteSchema(owner);

  // 2. Setup Temporary Storage
  const tempArchiveRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skyra-live-archive-'));
  const tempCacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skyra-live-cache-'));

  const suffix = crypto.randomUUID().slice(0, 8);
  const tenantRes = await owner.query(
    `INSERT INTO tenants (code, name, status, updated_at)
     VALUES ($1, $2, 'ACTIVE', now()) RETURNING id`,
    [`tenant-cmp-${suffix}`, `Tenant Compaction ${suffix}`]
  );
  const tenantId = tenantRes.rows[0].id;
  const projectId = `proj-compaction-${suffix}`;

  await owner.query(
    `INSERT INTO projects (id, tenant_id, name, status, updated_at)
     VALUES ($1, $2, 'Compaction Test Project', 'ACTIVE', now())`,
    [projectId, tenantId]
  );

  // Set project retention with legal hold active
  await owner.query(
    `INSERT INTO project_retention_policies (tenant_id, project_id, retention_days, enable_parquet_purge, is_legal_hold, updated_at)
     VALUES ($1, $2, 90, true, true, now())`,
    [tenantId, projectId]
  );

  const environment = 'production';
  const serviceName = 'gateway';
  const partitionDate = '2026-11-20';
  const segmentFilename = 'segment-0001.jsonl';

  // Create real archive JSONL on disk
  const partitionDir = path.join(tempArchiveRoot, tenantId, projectId, environment, serviceName, partitionDate);
  fs.mkdirSync(partitionDir, { recursive: true });

  const jsonlPath = path.join(partitionDir, segmentFilename);
  const manifestPath = path.join(partitionDir, 'segment-0001.manifest.json');

  const events = [];
  const baseTime = new Date(`${partitionDate}T12:00:00.000Z`).getTime();
  for (let i = 0; i < 25; i++) {
    events.push({
      '@timestamp': new Date(baseTime + i * 1000).toISOString(),
      ecs: { version: '8.11.0' },
      event: { id: `evt-${suffix}-${i}`, action: 'http_request' },
      log: { level: i % 2 === 0 ? 'info' : 'warn' },
      message: `Live PostgreSQL transaction ${i}`,
      service: { name: serviceName, environment },
      skyra: { tenant_id: tenantId, project_id: projectId },
    });
  }

  const jsonlContent = events.map((e) => JSON.stringify(e)).join('\n') + '\n';
  fs.writeFileSync(jsonlPath, jsonlContent, 'utf8');

  const byteSize = Buffer.byteLength(jsonlContent, 'utf8');
  const sha256 = crypto.createHash('sha256').update(jsonlContent, 'utf8').digest('hex');
  const firstEventTimestamp = new Date(baseTime);
  const lastEventTimestamp = new Date(baseTime + 24000);
  const finalizedAt = new Date();

  fs.writeFileSync(manifestPath, JSON.stringify({
    manifest_version: '1.0',
    tenant_id: tenantId,
    project_id: projectId,
    environment,
    service_name: serviceName,
    date: partitionDate,
    segment_filename: segmentFilename,
    record_count: 25,
    byte_size: byteSize,
    sha256_checksum: sha256,
    first_event_timestamp: firstEventTimestamp.toISOString(),
    last_event_timestamp: lastEventTimestamp.toISOString(),
    finalized_at: finalizedAt.toISOString(),
  }, null, 2), 'utf8');

  // Insert segment into PostgreSQL archive_segments table
  await owner.query(
    `INSERT INTO archive_segments (
       id, tenant_id, project_id, environment, service_name, date,
       segment_filename, record_count, byte_size, sha256_checksum,
       first_event_timestamp, last_event_timestamp, finalized_at,
       writer_instance_id, journal_segment_id, journal_start_offset, journal_end_offset
     ) VALUES (
       gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
     )`,
    [
      tenantId, projectId, environment, serviceName, partitionDate,
      segmentFilename, 25, byteSize, sha256,
      firstEventTimestamp, lastEventTimestamp, finalizedAt,
      'test-writer-live', 'wal-00000001', 0, byteSize
    ]
  );

  // 3. Initialize Query Service with live database URL
  const config = new QueryConfigService({
    nodeEnv: 'test',
    databaseUrl: env.ISOLATED_DATABASE_URL,
    archiveRoot: tempArchiveRoot,
    parquetCacheRoot: tempCacheRoot,
    parquetCacheEnabled: true,
    parquetMaterializationEnabled: true,
    compactionEnabled: true,
    compactionIntervalMs: 100,
    compactionBatchSize: 10,
    compactionMaxWorkers: 2,
    compactionLockTtlMs: 5000,
  });

  const prisma = new PrismaService(config);
  await prisma.onModuleInit();
  const dbHealthy = await prisma.isHealthy();
  assert.equal(dbHealthy, true, 'PrismaService must be healthy on isolated PostgreSQL');

  const audit = new QueryAuditService(config);
  const duckdb = new DuckDbInstanceManager(config);
  await duckdb.initialize();

  const parquetPathSafety = new ParquetPathSafetyService(config);
  const archivePathSafety = new PathSafetyService(config);
  const manifestVerifier = new ManifestVerifierService();
  const prismaArchiveRepo = new PrismaArchiveSegmentRepository(prisma);

  const catalog = new FileParquetCatalogService(parquetPathSafety, config, audit);
  const converter = new DuckDbParquetConverter(duckdb, parquetPathSafety);
  const materializeUseCase = new MaterializeSegmentUseCase(catalog, converter, audit, config);
  const recoverUseCase = new RecoverMaterializationUseCase(parquetPathSafety);
  const lockCoordinator = new CompactionLockCoordinatorService(parquetPathSafety, config, audit, prisma);
  const discoveryService = new CompactionDiscoveryService(
    prismaArchiveRepo,
    catalog,
    archivePathSafety,
    manifestVerifier,
    config,
    audit,
    prisma
  );

  const compactor = new BackgroundCompactionService(
    config,
    audit,
    materializeUseCase,
    recoverUseCase,
    lockCoordinator,
    discoveryService
  );

  try {
    // 4. Test Discovery via PostgreSQL ArchiveSegment table
    const eligible = await discoveryService.discoverEligibleSegments(10);
    const candidate = eligible.find((e) => e.descriptor.segmentFilename === segmentFilename);
    assert.ok(candidate, 'Sealed segment must be discovered from PostgreSQL archive_segments table');
    assert.equal(candidate.descriptor.recordCount, 25);
    assert.equal(candidate.descriptor.sha256Checksum, sha256);
    assert.equal(candidate.isLegalHold, true, 'Legal hold setting must be read from project_retention_policies');

    // 5. Test Live PostgreSQL Advisory Lock
    const lock1 = await lockCoordinator.claimSegment(candidate.descriptor);
    assert.ok(lock1, 'Worker 1 should acquire both file claim and PostgreSQL advisory lock');

    // Worker 2 attempts same segment
    const lockCoordinator2 = new CompactionLockCoordinatorService(parquetPathSafety, config, audit, prisma);
    const lock2 = await lockCoordinator2.claimSegment(candidate.descriptor);
    assert.equal(lock2, null, 'Worker 2 must fail to claim while Worker 1 holds PostgreSQL advisory lock');

    // Release lock 1
    await lockCoordinator.releaseClaim(lock1);

    // 6. Execute Compaction
    const progress = await compactor.compactOnce();
    assert.equal(progress.totalConverted >= 1, true, 'Should successfully compact segment');
    assert.equal(progress.totalFailed, 0);

    const job = progress.jobResults.find((j) => j.segmentId === segmentFilename);
    assert.ok(job, 'Job result must exist for segment');
    assert.equal(job.success, true);
    assert.equal(job.recordCount, 25);
    assert.equal(job.isLegalHold, true);

    // 7. Verify Parquet artifact in catalog
    const desc = await catalog.getParquetDescriptor(candidate.descriptor);
    assert.ok(desc, 'Parquet descriptor must exist and be registered');
    assert.equal(desc.integrityStatus, 'VERIFIED');
    assert.equal(desc.recordCount, 25);
    assert.equal(desc.sourceChecksum, sha256);
    assert.ok(fs.existsSync(desc.resolvedPath));

    // 8. Verify Querying via DuckDB & Hybrid Planner
    const hybridPlanner = new HybridSourcePlannerService(catalog, config, audit);
    const sqlGen = new SqlGeneratorService();
    const governor = new QueryResourceGovernorService();
    const queryAdapter = new DuckDbLogQueryAdapter(duckdb, sqlGen, governor, audit, undefined, parquetPathSafety);

    const mockAuthPort = {
      resolveAuthorizedProjects: async (p, r) => ({
        tenantId,
        effectiveProjects: [projectId],
        isWildcard: false,
      }),
    };

    const discoveryAppService = new ArchiveDiscoveryService(
      prismaArchiveRepo,
      mockAuthPort,
      archivePathSafety,
      manifestVerifier,
      config,
      audit
    );

    const queryPlanner = new QueryPlannerService(
      discoveryAppService,
      mockAuthPort,
      new FilterCompilerService(),
      config,
      audit,
      hybridPlanner
    );

    const principal = {
      sub: 'auditor-1',
      tenantId,
      authorizedProjects: [projectId],
      allowedEnvironments: [environment],
      roles: ['analyst'],
      iss: 'https://auth.skyra.internal',
      aud: 'skyra-loghub-query',
      exp: Math.floor(Date.now() / 1000) + 3600,
    };

    const plan = await queryPlanner.planQuery(principal, {
      time_range: {
        start: `${partitionDate}T00:00:00.000Z`,
        end: `${partitionDate}T23:59:59.999Z`,
      },
      projects: [projectId],
      limit: 100,
    });

    assert.ok(plan.parquetDescriptors && plan.parquetDescriptors.length >= 1, 'Query plan should select materialized Parquet');
    const result = await queryAdapter.execute(plan);
    assert.equal(result.events.length, 25, 'Query must return all 25 events from Parquet artifact');

    // 9. Nondestructive Invariants: Verify original files and DB records remain intact
    const currentJsonl = fs.readFileSync(jsonlPath, 'utf8');
    const currentSha = crypto.createHash('sha256').update(currentJsonl).digest('hex');
    assert.equal(currentSha, sha256, 'Canonical JSONL source must never be modified');
    assert.ok(fs.existsSync(manifestPath), 'Manifest must not be deleted');

    const dbCheck = await owner.query(
      `SELECT count(*) FROM archive_segments WHERE tenant_id = $1 AND project_id = $2`,
      [tenantId, projectId]
    );
    assert.equal(Number(dbCheck.rows[0].count), 1, 'Database archive segment row must remain intact');

  } finally {
    await compactor.onModuleDestroy();
    await prisma.onModuleDestroy();
    await owner.query(`DELETE FROM archive_segments WHERE tenant_id = $1`, [tenantId]);
    await owner.query(`DELETE FROM project_retention_policies WHERE tenant_id = $1`, [tenantId]);
    await owner.query(`DELETE FROM projects WHERE tenant_id = $1`, [tenantId]);
    await owner.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
    await owner.end();

    try {
      fs.rmSync(tempArchiveRoot, { recursive: true, force: true });
      fs.rmSync(tempCacheRoot, { recursive: true, force: true });
    } catch {
      // safe cleanup
    }
  }
});
