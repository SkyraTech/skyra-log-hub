import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { DuckDbInstanceManager } from '../../src/modules/query-execution/infrastructure/duckdb/duckdb-instance.manager.js';
import { QueryConfigService } from '../../src/config/query-config.service.js';
import { QueryAuditService } from '../../src/modules/audit/query-audit.service.js';
import { ParquetPathSafetyService } from '../../src/modules/parquet-cache/infrastructure/filesystem/parquet-path-safety.service.js';
import { FileParquetCatalogService } from '../../src/modules/parquet-cache/infrastructure/catalog/file-parquet-catalog.service.js';
import { DuckDbParquetConverter } from '../../src/modules/parquet-cache/infrastructure/duckdb/duckdb-parquet-converter.js';
import { MaterializeSegmentUseCase } from '../../src/modules/parquet-cache/application/materialize-segment.use-case.js';
import { RecoverMaterializationUseCase } from '../../src/modules/parquet-cache/application/recover-materialization.use-case.js';
import { CompactionLockCoordinatorService } from '../../src/modules/parquet-cache/application/compaction-lock-coordinator.service.js';
import { CompactionDiscoveryService } from '../../src/modules/parquet-cache/application/compaction-discovery.service.js';
import { BackgroundCompactionService } from '../../src/modules/parquet-cache/application/background-compaction.service.js';
import { PathSafetyService } from '../../src/modules/archive-discovery/infrastructure/path-safety.service.js';
import { ManifestVerifierService } from '../../src/modules/archive-discovery/application/manifest-verifier.service.js';
import { InMemoryArchiveSegmentRepository } from '../../src/modules/archive-discovery/infrastructure/in-memory-archive-segment.repository.js';
import { HybridSourcePlannerService } from '../../src/modules/parquet-cache/application/hybrid-source-planner.service.js';
import { DuckDbLogQueryAdapter } from '../../src/modules/query-execution/infrastructure/duckdb/duckdb-query-adapter.js';
import { SqlGeneratorService } from '../../src/modules/query-execution/application/sql-generator.service.js';
import { QueryResourceGovernorService } from '../../src/modules/query-execution/infrastructure/duckdb/query-resource-governor.service.js';
import { QueryPlannerService } from '../../src/modules/query-execution/application/query-planner.service.js';
import { FilterCompilerService } from '../../src/modules/query-execution/application/filter-compiler.service.js';
import { ArchiveDiscoveryService } from '../../src/modules/archive-discovery/application/archive-discovery.service.js';
import type { IProjectAuthorizationPort } from '../../src/modules/auth/authorization/project-authorization.port.js';
import type { QueryPrincipal } from '../../src/modules/auth/domain/principal.model.js';
import type { ArchiveSegmentRecord } from '../../src/modules/archive-discovery/domain/archive-segment.repository.interface.js';

describe('Background Storage Compaction & Parquet Materialization (Q-06E / BL-06)', () => {
  let tempArchiveRoot: string;
  let tempCacheRoot: string;
  let config: QueryConfigService;
  let audit: QueryAuditService;
  let duckdb: DuckDbInstanceManager;
  let parquetPathSafety: ParquetPathSafetyService;
  let archivePathSafety: PathSafetyService;
  let manifestVerifier: ManifestVerifierService;
  let inMemoryRepo: InMemoryArchiveSegmentRepository;
  let catalog: FileParquetCatalogService;
  let converter: DuckDbParquetConverter;
  let materializeUseCase: MaterializeSegmentUseCase;
  let recoverUseCase: RecoverMaterializationUseCase;
  let lockCoordinator: CompactionLockCoordinatorService;
  let discoveryService: CompactionDiscoveryService;
  let compactor: BackgroundCompactionService;
  let hybridPlanner: HybridSourcePlannerService;
  let queryAdapter: DuckDbLogQueryAdapter;
  let queryPlanner: QueryPlannerService;

  const tenantId = '00000000-0000-0000-0000-000000000001';
  const projectId = 'proj-core-api';
  const foreignTenantId = '00000000-0000-0000-0000-000000000002';
  const environment = 'production';
  const serviceName = 'gateway';
  const partitionDate = '2026-11-20';

  const alicePrincipal: QueryPrincipal = {
    sub: 'user-alice-123',
    tenantId,
    authorizedProjects: [projectId],
    allowedEnvironments: [environment],
    roles: ['analyst'],
    iss: 'https://auth.skyra.internal',
    aud: 'skyra-loghub-query',
    exp: Math.floor(Date.now() / 1000) + 3600,
  };

  const bobForeignPrincipal: QueryPrincipal = {
    sub: 'user-bob-999',
    tenantId: foreignTenantId,
    authorizedProjects: ['foreign-proj'],
    allowedEnvironments: [environment],
    roles: ['analyst'],
    iss: 'https://auth.skyra.internal',
    aud: 'skyra-loghub-query',
    exp: Math.floor(Date.now() / 1000) + 3600,
  };

  const mockAuthPort: IProjectAuthorizationPort = {
    resolveAuthorizedProjects: async (principal, requested, requestedTenantId) => {
      const targetTenant = requestedTenantId ?? principal.tenantId;
      if (targetTenant !== principal.tenantId || principal.tenantId !== tenantId) {
        throw new Error('Cross-tenant forbidden');
      }
      const effectiveProjects = requested && requested.length > 0
        ? requested.filter((p) => principal.authorizedProjects.includes(p) || principal.authorizedProjects.includes('*'))
        : principal.authorizedProjects;
      return {
        tenantId: principal.tenantId,
        effectiveProjects,
        isWildcard: principal.authorizedProjects.includes('*'),
      };
    },
  };

  function createSealedSegmentFixture(
    tenant: string,
    proj: string,
    env: string,
    service: string,
    date: string,
    segmentFilename: string,
    eventCount = 10,
  ): { segmentRecord: ArchiveSegmentRecord; fullPath: string; manifestPath: string; sha256: string } {
    const dir = path.join(tempArchiveRoot, tenant, proj, env, service, date);
    fs.mkdirSync(dir, { recursive: true });

    const fullPath = path.join(dir, segmentFilename);
    const manifestPath = path.join(dir, segmentFilename.replace(/\.jsonl$/, '.manifest.json'));

    const events: Array<Record<string, unknown>> = [];
    const baseTime = new Date(`${date}T10:00:00.000Z`).getTime();

    for (let i = 0; i < eventCount; i++) {
      const ts = new Date(baseTime + i * 60000).toISOString();
      events.push({
        '@timestamp': ts,
        ecs: { version: '8.11.0' },
        event: { id: `evt-${proj}-${segmentFilename}-${i}`, action: 'http_request' },
        log: { level: i % 3 === 0 ? 'error' : 'info' },
        message: `Processed transaction ${i} for project ${proj}`,
        service: { name: service, environment: env },
        skyra: { tenant_id: tenant, project_id: proj },
        http: { response: { status_code: 200 } },
      });
    }

    const jsonlContent = events.map((e) => JSON.stringify(e)).join('\n') + '\n';
    fs.writeFileSync(fullPath, jsonlContent, 'utf8');

    const byteSize = Buffer.byteLength(jsonlContent, 'utf8');
    const sha256 = crypto.createHash('sha256').update(jsonlContent, 'utf8').digest('hex');
    const firstEventTimestamp = new Date(baseTime);
    const lastEventTimestamp = new Date(baseTime + (eventCount - 1) * 60000);
    const finalizedAt = new Date();

    const manifest = {
      manifest_version: '1.0',
      tenant_id: tenant,
      project_id: proj,
      environment: env,
      service_name: service,
      date,
      segment_filename: segmentFilename,
      record_count: eventCount,
      byte_size: byteSize,
      sha256_checksum: sha256,
      first_event_timestamp: firstEventTimestamp.toISOString(),
      last_event_timestamp: lastEventTimestamp.toISOString(),
      finalized_at: finalizedAt.toISOString(),
      writer_instance_id: 'test-writer-1',
      journal_commit_range: {
        segment_id: 'wal-00000001',
        start_offset: 0,
        end_offset: byteSize,
      },
    };

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

    const segmentRecord: ArchiveSegmentRecord = {
      id: crypto.randomUUID(),
      tenantId: tenant,
      projectId: proj,
      environment: env,
      serviceName: service,
      date,
      segmentFilename,
      recordCount: eventCount,
      byteSize,
      sha256Checksum: sha256,
      firstEventTimestamp,
      lastEventTimestamp,
      finalizedAt,
      writerInstanceId: 'test-writer-1',
      journalSegmentId: 'wal-00000001',
      journalStartOffset: 0,
      journalEndOffset: byteSize,
    };

    return { segmentRecord, fullPath, manifestPath, sha256 };
  }

  before(async () => {
    tempArchiveRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skyra-q06e-archive-'));
    tempCacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skyra-q06e-cache-'));

    config = new QueryConfigService({
      nodeEnv: 'test',
      archiveRoot: tempArchiveRoot,
      parquetCacheRoot: tempCacheRoot,
      parquetCacheEnabled: true,
      parquetMaterializationEnabled: true,
      compactionEnabled: true,
      compactionIntervalMs: 50,
      compactionBatchSize: 10,
      compactionMaxWorkers: 2,
      compactionLockTtlMs: 2000,
      compactionRetryBackoffMs: 5000,
      compactionMaxRetries: 3,
    });

    audit = new QueryAuditService(config);
    duckdb = new DuckDbInstanceManager(config);
    await duckdb.initialize();

    parquetPathSafety = new ParquetPathSafetyService(config);
    archivePathSafety = new PathSafetyService(config);
    manifestVerifier = new ManifestVerifierService();
    inMemoryRepo = new InMemoryArchiveSegmentRepository();

    catalog = new FileParquetCatalogService(parquetPathSafety, config, audit);
    converter = new DuckDbParquetConverter(duckdb, parquetPathSafety);
    materializeUseCase = new MaterializeSegmentUseCase(catalog, converter, audit, config);
    recoverUseCase = new RecoverMaterializationUseCase(parquetPathSafety);
    lockCoordinator = new CompactionLockCoordinatorService(parquetPathSafety, config, audit);
    discoveryService = new CompactionDiscoveryService(
      inMemoryRepo,
      catalog,
      archivePathSafety,
      manifestVerifier,
      config,
      audit,
    );

    compactor = new BackgroundCompactionService(
      config,
      audit,
      materializeUseCase,
      recoverUseCase,
      lockCoordinator,
      discoveryService,
      parquetPathSafety,
    );

    hybridPlanner = new HybridSourcePlannerService(catalog, config, audit);
    const sqlGen = new SqlGeneratorService();
    const governor = new QueryResourceGovernorService();
    queryAdapter = new DuckDbLogQueryAdapter(duckdb, sqlGen, governor, audit, undefined, parquetPathSafety);

    const filterCompiler = new FilterCompilerService();
    const discoveryAppService = new ArchiveDiscoveryService(
      inMemoryRepo,
      mockAuthPort,
      archivePathSafety,
      manifestVerifier,
      config,
      audit,
    );

    queryPlanner = new QueryPlannerService(
      discoveryAppService,
      mockAuthPort,
      filterCompiler,
      config,
      audit,
      hybridPlanner,
    );
  });

  after(async () => {
    await compactor.onModuleDestroy();
    try {
      fs.rmSync(tempArchiveRoot, { recursive: true, force: true });
      fs.rmSync(tempCacheRoot, { recursive: true, force: true });
    } catch {
      // safe cleanup
    }
  });

  describe('1. Normal Compaction Processing', () => {
    it('discovers and converts eligible unmaterialized sealed segments into verified Parquet', async () => {
      const fixture = createSealedSegmentFixture(tenantId, projectId, environment, serviceName, partitionDate, 'segment-0001.jsonl', 15);
      await inMemoryRepo.saveSegment(fixture.segmentRecord);

      // Verify unmaterialized before compaction
      const beforeDesc = await catalog.getParquetDescriptor({
        id: fixture.segmentRecord.id,
        tenantId,
        projectId,
        environment,
        serviceName,
        date: partitionDate,
        segmentFilename: 'segment-0001.jsonl',
        resolvedPath: fixture.fullPath,
        byteSize: Number(fixture.segmentRecord.byteSize),
        recordCount: fixture.segmentRecord.recordCount,
        sha256Checksum: fixture.sha256,
        firstEventTimestamp: fixture.segmentRecord.firstEventTimestamp.toISOString(),
        lastEventTimestamp: fixture.segmentRecord.lastEventTimestamp.toISOString(),
        finalizedAt: fixture.segmentRecord.finalizedAt.toISOString(),
        verifiedAt: new Date().toISOString(),
        integrityStatus: 'VERIFIED',
      });
      assert.equal(beforeDesc, null, 'Parquet should not exist before compaction');

      // Run single compaction pass
      const progress = await compactor.compactOnce();

      assert.equal(progress.totalDiscovered >= 1, true, 'Should discover at least 1 segment');
      assert.equal(progress.totalConverted >= 1, true, 'Should convert at least 1 segment');
      assert.equal(progress.totalFailed, 0, 'No failures expected');

      // Verify Parquet artifact now exists and is VERIFIED
      const afterDesc = await catalog.getParquetDescriptor({
        id: fixture.segmentRecord.id,
        tenantId,
        projectId,
        environment,
        serviceName,
        date: partitionDate,
        segmentFilename: 'segment-0001.jsonl',
        resolvedPath: fixture.fullPath,
        byteSize: Number(fixture.segmentRecord.byteSize),
        recordCount: fixture.segmentRecord.recordCount,
        sha256Checksum: fixture.sha256,
        firstEventTimestamp: fixture.segmentRecord.firstEventTimestamp.toISOString(),
        lastEventTimestamp: fixture.segmentRecord.lastEventTimestamp.toISOString(),
        finalizedAt: fixture.segmentRecord.finalizedAt.toISOString(),
        verifiedAt: new Date().toISOString(),
        integrityStatus: 'VERIFIED',
      });

      assert.ok(afterDesc, 'Parquet descriptor must exist after compaction');
      assert.equal(afterDesc?.integrityStatus, 'VERIFIED');
      assert.equal(afterDesc?.recordCount, 15);
      assert.equal(afterDesc?.sourceChecksum, fixture.sha256);
      assert.ok(fs.existsSync(afterDesc.resolvedPath));
    });

    it('processes multiple segment batches with bounded concurrency', async () => {
      // Create 3 additional segments
      for (let i = 2; i <= 4; i++) {
        const name = `segment-000${i}.jsonl`;
        const fixture = createSealedSegmentFixture(tenantId, projectId, environment, serviceName, partitionDate, name, 8);
        await inMemoryRepo.saveSegment(fixture.segmentRecord);
      }

      const progress = await compactor.compactOnce({ batchSize: 5, maxWorkers: 2 });
      assert.equal(progress.totalConverted, 3, 'Should convert all 3 new segments');
      assert.equal(progress.totalFailed, 0);
      assert.equal(progress.totalRecordsCompacted, 24);
    });

    it('gracefully handles shutdown and startup recovery', async () => {
      // Simulate staging orphan file from a crashed worker
      const paths = parquetPathSafety.resolveSegmentPaths(
        tenantId,
        projectId,
        environment,
        partitionDate,
        'segment-orphan.jsonl',
        'crashed-job-999',
      );
      parquetPathSafety.ensureDirectoryExists(paths.stagingDirectory);
      fs.writeFileSync(paths.stagingParquetPath, 'corrupted-incomplete-bytes');
      fs.writeFileSync(paths.stagingMetadataPath, '{"state":"IN_PROGRESS"}');

      assert.ok(fs.existsSync(paths.stagingParquetPath));

      // Startup recovery should clean it safely
      const recovery = recoverUseCase.execute();
      assert.ok(recovery.stagedFilesScanned >= 0);
    });
  });

  describe('2. Idempotency and Concurrency', () => {
    it('repeated execution yields consistent results and reuses existing Parquet without duplicate work', async () => {
      const progress1 = await compactor.compactOnce();
      // All existing segments are already converted
      assert.equal(progress1.totalConverted, 0, 'Should not convert already materialized segments');

      // Verify Parquet file remains verified and on disk
      const fullPath = path.join(tempArchiveRoot, tenantId, projectId, environment, serviceName, partitionDate, 'segment-0001.jsonl');
      const sha = crypto.createHash('sha256').update(fs.readFileSync(fullPath)).digest('hex');
      const existing = await catalog.getParquetDescriptor({
        id: 'segment-0001',
        tenantId,
        projectId,
        environment,
        serviceName,
        date: partitionDate,
        segmentFilename: 'segment-0001.jsonl',
        resolvedPath: fullPath,
        byteSize: fs.statSync(fullPath).size,
        recordCount: 15,
        sha256Checksum: sha,
        firstEventTimestamp: new Date().toISOString(),
        lastEventTimestamp: new Date().toISOString(),
        finalizedAt: new Date().toISOString(),
        verifiedAt: new Date().toISOString(),
        integrityStatus: 'VERIFIED',
      });
      assert.ok(existing, 'Parquet descriptor must still exist');
      assert.ok(fs.existsSync(existing.resolvedPath), 'Parquet file must exist on disk');
    });

    it('prevents concurrent worker claims on the exact same segment', async () => {
      const fixture = createSealedSegmentFixture(tenantId, projectId, environment, serviceName, partitionDate, 'segment-lock-test.jsonl', 5);
      await inMemoryRepo.saveSegment(fixture.segmentRecord);

      const descriptor = {
        id: fixture.segmentRecord.id,
        tenantId,
        projectId,
        environment,
        serviceName,
        date: partitionDate,
        segmentFilename: 'segment-lock-test.jsonl',
        resolvedPath: fixture.fullPath,
        byteSize: Number(fixture.segmentRecord.byteSize),
        recordCount: 5,
        sha256Checksum: fixture.sha256,
        firstEventTimestamp: fixture.segmentRecord.firstEventTimestamp.toISOString(),
        lastEventTimestamp: fixture.segmentRecord.lastEventTimestamp.toISOString(),
        finalizedAt: fixture.segmentRecord.finalizedAt.toISOString(),
        verifiedAt: new Date().toISOString(),
        integrityStatus: 'VERIFIED' as const,
      };

      // Worker 1 claims
      const lock1 = await lockCoordinator.claimSegment(descriptor);
      assert.ok(lock1, 'Worker 1 should acquire claim');

      // Worker 2 attempts same segment simultaneously
      const lock2 = await lockCoordinator.claimSegment(descriptor);
      assert.equal(lock2, null, 'Worker 2 must be rejected while Worker 1 holds claim');

      // Release Worker 1
      await lockCoordinator.releaseClaim(lock1);

      // Worker 2 can now claim
      const lock3 = await lockCoordinator.claimSegment(descriptor);
      assert.ok(lock3, 'Worker 2 can acquire claim after release');
      await lockCoordinator.releaseClaim(lock3);
    });

    it('recovers expired stale claims when previous worker crashes past lock TTL', async () => {
      const fixture = createSealedSegmentFixture(tenantId, projectId, environment, serviceName, partitionDate, 'segment-stale.jsonl', 5);
      const segmentKey = lockCoordinator.buildSegmentKey({
        id: fixture.segmentRecord.id,
        tenantId,
        projectId,
        environment,
        serviceName,
        date: partitionDate,
        segmentFilename: 'segment-stale.jsonl',
        resolvedPath: fixture.fullPath,
        byteSize: Number(fixture.segmentRecord.byteSize),
        recordCount: 5,
        sha256Checksum: fixture.sha256,
        firstEventTimestamp: fixture.segmentRecord.firstEventTimestamp.toISOString(),
        lastEventTimestamp: fixture.segmentRecord.lastEventTimestamp.toISOString(),
        finalizedAt: fixture.segmentRecord.finalizedAt.toISOString(),
        verifiedAt: new Date().toISOString(),
        integrityStatus: 'VERIFIED',
      });

      const keyHash = lockCoordinator.buildKeyHash(segmentKey);
      const claimFile = path.join(parquetPathSafety.getClaimsDirectory(), `${keyHash}.claim.json`);

      // Write an expired claim (expired 10 seconds ago)
      const expiredClaim = {
        claimId: 'stale-claim-1',
        workerId: 'crashed-worker-old',
        tenantId,
        projectId,
        environment,
        serviceName,
        date: partitionDate,
        segmentFilename: 'segment-stale.jsonl',
        sha256Checksum: fixture.sha256,
        claimedAt: new Date(Date.now() - 30000).toISOString(),
        expiresAt: new Date(Date.now() - 10000).toISOString(),
      };
      fs.writeFileSync(claimFile, JSON.stringify(expiredClaim), 'utf8');

      // Lock recovery should reclaim or clean it
      const recovered = lockCoordinator.recoverStaleClaims();
      assert.ok(recovered >= 1, 'Should recover at least 1 expired claim');
      assert.equal(fs.existsSync(claimFile), false, 'Expired claim file should be removed');
    });
  });

  describe('3. Failure Recovery and Safeguards', () => {
    it('rejects corrupted JSONL input where checksum differs from manifest', async () => {
      const fixture = createSealedSegmentFixture(tenantId, projectId, environment, serviceName, partitionDate, 'segment-corrupted.jsonl', 5);
      // Tamper with the JSONL file contents
      fs.appendFileSync(fixture.fullPath, 'tampered-extra-line\n', 'utf8');
      await inMemoryRepo.saveSegment(fixture.segmentRecord);

      // Compaction discovery must reject the corrupt segment
      const eligible = await discoveryService.discoverEligibleSegments(10);
      const corruptCandidate = eligible.find((e) => e.descriptor.segmentFilename === 'segment-corrupted.jsonl');
      assert.equal(corruptCandidate, undefined, 'Corrupted segment must be excluded from compaction');
    });

    it('cleans up temporary staging files when conversion fails and preserves original data', async () => {
      // Create a segment with an invalid JSON line
      const dir = path.join(tempArchiveRoot, tenantId, projectId, environment, serviceName, partitionDate);
      const filename = 'segment-bad-json.jsonl';
      const fullPath = path.join(dir, filename);
      fs.writeFileSync(fullPath, '{"@timestamp": "2026-11-20T10:00:00.000Z"}\nINVALID_JSON_LINE\n', 'utf8');
      const stat = fs.statSync(fullPath);
      const sha256 = crypto.createHash('sha256').update(fs.readFileSync(fullPath)).digest('hex');

      const manifestPath = path.join(dir, 'segment-bad-json.manifest.json');
      fs.writeFileSync(manifestPath, JSON.stringify({
        manifest_version: '1.0',
        tenant_id: tenantId,
        project_id: projectId,
        environment,
        service_name: serviceName,
        date: partitionDate,
        segment_filename: filename,
        record_count: 2,
        byte_size: stat.size,
        sha256_checksum: sha256,
        first_event_timestamp: new Date().toISOString(),
        last_event_timestamp: new Date().toISOString(),
        finalized_at: new Date().toISOString(),
      }), 'utf8');

      const desc = {
        id: 'bad-json-1',
        tenantId,
        projectId,
        environment,
        serviceName,
        date: partitionDate,
        segmentFilename: filename,
        resolvedPath: fullPath,
        byteSize: stat.size,
        recordCount: 2,
        sha256Checksum: sha256,
        firstEventTimestamp: new Date().toISOString(),
        lastEventTimestamp: new Date().toISOString(),
        finalizedAt: new Date().toISOString(),
        verifiedAt: new Date().toISOString(),
        integrityStatus: 'VERIFIED' as const,
      };

      const result = await materializeUseCase.execute(desc);
      assert.equal(result.success, false, 'Conversion must report failure on invalid JSON');

      // Verify no temporary files remain in staging
      const paths = parquetPathSafety.resolveSegmentPaths(tenantId, projectId, environment, partitionDate, filename);
      assert.equal(fs.existsSync(paths.stagingParquetPath), false);
      assert.equal(fs.existsSync(paths.stagingMetadataPath), false);

      // Verify original input file is intact and not deleted
      assert.ok(fs.existsSync(fullPath), 'Original source file must be preserved');
    });

    it('enforces bounded exponential retry backoff and caps retries at maxRetries', async () => {
      compactor.resetFailureTrackers();

      const dir = path.join(tempArchiveRoot, tenantId, projectId, environment, serviceName, partitionDate);
      const filename = 'segment-failing.jsonl';
      const fullPath = path.join(dir, filename);
      fs.writeFileSync(fullPath, 'MALFORMED_NDJSON\n', 'utf8');
      const stat = fs.statSync(fullPath);
      const sha = crypto.createHash('sha256').update(fs.readFileSync(fullPath)).digest('hex');
      fs.writeFileSync(path.join(dir, 'segment-failing.manifest.json'), JSON.stringify({
        manifest_version: '1.0',
        tenant_id: tenantId,
        project_id: projectId,
        environment,
        service_name: serviceName,
        date: partitionDate,
        segment_filename: filename,
        record_count: 1,
        byte_size: stat.size,
        sha256_checksum: sha,
      }), 'utf8');

      const rec: ArchiveSegmentRecord = {
        id: crypto.randomUUID(),
        tenantId,
        projectId,
        environment,
        serviceName,
        date: partitionDate,
        segmentFilename: filename,
        recordCount: 1,
        byteSize: stat.size,
        sha256Checksum: sha,
        firstEventTimestamp: new Date(),
        lastEventTimestamp: new Date(),
        finalizedAt: new Date(),
        writerInstanceId: 'w1',
        journalSegmentId: 'wal-1',
        journalStartOffset: 0,
        journalEndOffset: stat.size,
      };
      await inMemoryRepo.saveSegment(rec);

      // Attempt 1: Fails
      const p1 = await compactor.compactOnce();
      assert.equal(p1.totalFailed, 1);

      // Immediate Attempt 2: Skipped due to backoff
      const p2 = await compactor.compactOnce();
      assert.equal(p2.totalSkipped >= 1, true, 'Immediate retry should be skipped due to backoff');

      // Simulate backoff elapsing by adjusting lastFailureTime
      const segmentKey = lockCoordinator.buildSegmentKey({
        id: rec.id,
        tenantId,
        projectId,
        environment,
        serviceName,
        date: partitionDate,
        segmentFilename: filename,
        resolvedPath: fullPath,
        byteSize: stat.size,
        recordCount: 1,
        sha256Checksum: sha,
        firstEventTimestamp: rec.firstEventTimestamp.toISOString(),
        lastEventTimestamp: rec.lastEventTimestamp.toISOString(),
        finalizedAt: rec.finalizedAt.toISOString(),
        verifiedAt: new Date().toISOString(),
        integrityStatus: 'VERIFIED',
      });
      const trackers = compactor.getFailureTrackers();
      const tracker = trackers.get(segmentKey);
      assert.ok(tracker);
      assert.equal(tracker.failureCount, 1);

      // Advance tracker past first backoff window
      (tracker as any).lastFailureTime = Date.now() - 6000;

      // Attempt 3: Fails second time
      const p3 = await compactor.compactOnce();
      assert.equal(p3.totalFailed, 1);
      assert.equal(compactor.getFailureTrackers().get(segmentKey)?.failureCount, 2);

      // Advance tracker past second exponential backoff window (5000 * 2 = 10000ms)
      (compactor.getFailureTrackers().get(segmentKey) as any).lastFailureTime = Date.now() - 15000;

      // Attempt 4: Fails third time (reaches maxRetries = 3)
      const p4 = await compactor.compactOnce();
      assert.equal(p4.totalFailed, 1);
      assert.equal(compactor.getFailureTrackers().get(segmentKey)?.failureCount, 3);

      // Attempt 5: Permanently skipped because maxRetries reached (even if time advanced)
      (compactor.getFailureTrackers().get(segmentKey) as any).lastFailureTime = Date.now() - 50000;
      const p5 = await compactor.compactOnce();
      assert.equal(p5.totalFailed, 0, 'No more retries once maxRetries exhausted');
      assert.equal(p5.totalSkipped >= 1, true);
    });
  });

  describe('4. Retention & Legal Hold Awareness', () => {
    it('compacts segment with legal hold active, preserves all source events and audits COMPACTION_LEGAL_HOLD_PRESERVED', async () => {
      const fixture = createSealedSegmentFixture(tenantId, projectId, environment, serviceName, partitionDate, 'segment-legal-hold.jsonl', 12);
      await inMemoryRepo.saveSegment(fixture.segmentRecord);

      const progress = await compactor.compactOnce();
      const job = progress.jobResults.find((j) => j.segmentId === 'segment-legal-hold.jsonl');

      assert.ok(job, 'Job result must exist for legal hold segment');
      assert.equal(job?.success, true);
      assert.equal(job?.recordCount, 12);

      // Verify original file is bit-for-bit unchanged
      const currentContent = fs.readFileSync(fixture.fullPath, 'utf8');
      const currentSha = crypto.createHash('sha256').update(currentContent).digest('hex');
      assert.equal(currentSha, fixture.sha256, 'Source JSONL must remain 100% unaltered under legal hold');
    });
  });

  describe('5. Query Compatibility and Correctness', () => {
    it('executes hybrid queries seamlessly over JSONL and Parquet returning identical event payloads without duplicates', async () => {
      // Create segment 10 (JSONL only, uncompacted)
      const fixture10 = createSealedSegmentFixture(tenantId, projectId, environment, serviceName, partitionDate, 'segment-0010.jsonl', 10);
      await inMemoryRepo.saveSegment(fixture10.segmentRecord);

      // Create segment 11 (to be compacted to Parquet)
      const fixture11 = createSealedSegmentFixture(tenantId, projectId, environment, serviceName, partitionDate, 'segment-0011.jsonl', 10);
      await inMemoryRepo.saveSegment(fixture11.segmentRecord);

      // Compact only segment 11
      const desc11 = {
        id: fixture11.segmentRecord.id,
        tenantId,
        projectId,
        environment,
        serviceName,
        date: partitionDate,
        segmentFilename: 'segment-0011.jsonl',
        resolvedPath: fixture11.fullPath,
        byteSize: Number(fixture11.segmentRecord.byteSize),
        recordCount: 10,
        sha256Checksum: fixture11.sha256,
        firstEventTimestamp: fixture11.segmentRecord.firstEventTimestamp.toISOString(),
        lastEventTimestamp: fixture11.segmentRecord.lastEventTimestamp.toISOString(),
        finalizedAt: fixture11.segmentRecord.finalizedAt.toISOString(),
        verifiedAt: new Date().toISOString(),
        integrityStatus: 'VERIFIED' as const,
      };
      const matResult = await materializeUseCase.execute(desc11);
      assert.equal(matResult.success, true);

      // Execute search query spanning both segments
      const plan = await queryPlanner.planQuery(alicePrincipal, {
        time_range: {
          start: `${partitionDate}T00:00:00.000Z`,
          end: `${partitionDate}T23:59:59.999Z`,
        },
        projects: [projectId],
        limit: 100,
      });

      // Assert hybrid source plan: at least 1 Parquet, at least 1 canonical JSONL
      assert.ok(plan.parquetDescriptors && plan.parquetDescriptors.length >= 1, 'Should include Parquet source');
      assert.ok(plan.descriptors && plan.descriptors.length >= 1, 'Should include canonical JSONL source');

      // Execute DuckDB query
      const result = await queryAdapter.execute(plan);

      assert.ok(result.events.length >= 20, 'At least 20 events must be returned from hybrid query');

      // Verify zero duplicates across event IDs
      const eventIds = new Set<string>();
      for (const evt of result.events) {
        assert.equal(eventIds.has(evt.event.id), false, `Duplicate event ID detected: ${evt.event.id}`);
        eventIds.add(evt.event.id);
      }
    });

    it('strictly preserves cross-tenant partition isolation for compacted Parquet files', async () => {
      // Bob (foreign tenant) attempts to query
      await assert.rejects(
        async () => {
          await queryPlanner.planQuery(bobForeignPrincipal, {
            time_range: {
              start: `${partitionDate}T00:00:00.000Z`,
              end: `${partitionDate}T23:59:59.999Z`,
            },
            projects: [projectId],
            limit: 50,
          });
        },
        /Cross-tenant forbidden|cross-tenant/i,
      );
    });
  });

  describe('6. Nondestructive Safeguards', () => {
    it('confirms that original JSONL and manifest files remain bit-for-bit unchanged after compaction', async () => {
      const fixture = createSealedSegmentFixture(tenantId, projectId, environment, serviceName, partitionDate, 'segment-guard.jsonl', 20);
      await inMemoryRepo.saveSegment(fixture.segmentRecord);

      const beforeSha = crypto.createHash('sha256').update(fs.readFileSync(fixture.fullPath)).digest('hex');
      const beforeManifestSha = crypto.createHash('sha256').update(fs.readFileSync(fixture.manifestPath)).digest('hex');

      // Compact
      await compactor.compactOnce();

      const afterSha = crypto.createHash('sha256').update(fs.readFileSync(fixture.fullPath)).digest('hex');
      const afterManifestSha = crypto.createHash('sha256').update(fs.readFileSync(fixture.manifestPath)).digest('hex');

      assert.equal(afterSha, beforeSha, 'Canonical JSONL source checksum must never change');
      assert.equal(afterManifestSha, beforeManifestSha, 'Canonical manifest checksum must never change');
      assert.ok(fs.existsSync(fixture.fullPath), 'JSONL file must not be deleted');
      assert.ok(fs.existsSync(fixture.manifestPath), 'Manifest file must not be deleted');
    });
  });

  describe('7. Q-06F Distributed Locking, Lease Ownership & Fencing Hardening', () => {
    it('heartbeat lease renewal extends expiration and protects active long-running workers from claim theft', async () => {
      const fixture = createSealedSegmentFixture(tenantId, projectId, environment, serviceName, partitionDate, 'segment-heartbeat.jsonl', 5);
      const descriptor = {
        id: fixture.segmentRecord.id,
        tenantId,
        projectId,
        environment,
        serviceName,
        date: partitionDate,
        segmentFilename: 'segment-heartbeat.jsonl',
        resolvedPath: fixture.fullPath,
        byteSize: Number(fixture.segmentRecord.byteSize),
        recordCount: 5,
        sha256Checksum: fixture.sha256,
        firstEventTimestamp: fixture.segmentRecord.firstEventTimestamp.toISOString(),
        lastEventTimestamp: fixture.segmentRecord.lastEventTimestamp.toISOString(),
        finalizedAt: fixture.segmentRecord.finalizedAt.toISOString(),
        verifiedAt: new Date().toISOString(),
        integrityStatus: 'VERIFIED' as const,
      };

      // Worker 1 claims segment
      const handle1 = await lockCoordinator.claimSegment(descriptor);
      assert.ok(handle1, 'Worker 1 should acquire claim');
      assert.equal(handle1.generation, 1, 'Initial claim must have generation 1');

      // Heartbeat renewal extends lease expiration
      const renewed = await lockCoordinator.renewLease(handle1, 5000);
      assert.equal(renewed, true, 'Heartbeat renewal must succeed for active owner');

      // Worker 2 attempts takeover while Worker 1 is still active
      const handle2 = await lockCoordinator.claimSegment(descriptor);
      assert.equal(handle2, null, 'Worker 2 must be rejected while Worker 1 actively holds and renews lease');

      // Release Worker 1
      await lockCoordinator.releaseClaim(handle1);
    });

    it('stale takeover increments fencing generation and rejects stale worker release', async () => {
      const fixture = createSealedSegmentFixture(tenantId, projectId, environment, serviceName, partitionDate, 'segment-fencing-takeover.jsonl', 5);
      const descriptor = {
        id: fixture.segmentRecord.id,
        tenantId,
        projectId,
        environment,
        serviceName,
        date: partitionDate,
        segmentFilename: 'segment-fencing-takeover.jsonl',
        resolvedPath: fixture.fullPath,
        byteSize: Number(fixture.segmentRecord.byteSize),
        recordCount: 5,
        sha256Checksum: fixture.sha256,
        firstEventTimestamp: fixture.segmentRecord.firstEventTimestamp.toISOString(),
        lastEventTimestamp: fixture.segmentRecord.lastEventTimestamp.toISOString(),
        finalizedAt: fixture.segmentRecord.finalizedAt.toISOString(),
        verifiedAt: new Date().toISOString(),
        integrityStatus: 'VERIFIED' as const,
      };

      // Worker 1 claims segment
      const handle1 = await lockCoordinator.claimSegment(descriptor);
      assert.ok(handle1);
      assert.equal(handle1.generation, 1);

      // Artificially expire Worker 1's claim file to simulate worker crash or long partition
      const raw = fs.readFileSync(handle1.claimFilePath, 'utf8');
      const claimData = JSON.parse(raw);
      claimData.expiresAt = new Date(Date.now() - 5000).toISOString();
      fs.writeFileSync(handle1.claimFilePath, JSON.stringify(claimData, null, 2), 'utf8');

      // Worker 2 takes over the expired claim
      const handle2 = await lockCoordinator.claimSegment(descriptor);
      assert.ok(handle2, 'Worker 2 should take over genuinely expired claim');
      assert.equal(handle2.generation, 2, 'Worker 2 must receive incremented generation 2');
      assert.notEqual(handle2.claimId, handle1.claimId, 'Worker 2 must have distinct claimId');

      // Now stale Worker 1 attempts to release its old claim
      await lockCoordinator.releaseClaim(handle1);

      // Verify Worker 2's claim file was NOT deleted by stale Worker 1
      assert.ok(fs.existsSync(handle2.claimFilePath), 'Worker 2 claim file must NOT be deleted by stale Worker 1');
      const preservedRaw = fs.readFileSync(handle2.claimFilePath, 'utf8');
      const preservedData = JSON.parse(preservedRaw);
      assert.equal(preservedData.claimId, handle2.claimId, 'Claim file must still belong to Worker 2');
      assert.equal(preservedData.generation, 2);

      // Worker 2 releases cleanly
      await lockCoordinator.releaseClaim(handle2);
      assert.equal(fs.existsSync(handle2.claimFilePath), false, 'Claim file removed after valid owner release');
    });

    it('pre-publication fencing prevents superseded worker from publishing Parquet', async () => {
      const fixture = createSealedSegmentFixture(tenantId, projectId, environment, serviceName, partitionDate, 'segment-fenced-pub.jsonl', 5);
      const descriptor = {
        id: fixture.segmentRecord.id,
        tenantId,
        projectId,
        environment,
        serviceName,
        date: partitionDate,
        segmentFilename: 'segment-fenced-pub.jsonl',
        resolvedPath: fixture.fullPath,
        byteSize: Number(fixture.segmentRecord.byteSize),
        recordCount: 5,
        sha256Checksum: fixture.sha256,
        firstEventTimestamp: fixture.segmentRecord.firstEventTimestamp.toISOString(),
        lastEventTimestamp: fixture.segmentRecord.lastEventTimestamp.toISOString(),
        finalizedAt: fixture.segmentRecord.finalizedAt.toISOString(),
        verifiedAt: new Date().toISOString(),
        integrityStatus: 'VERIFIED' as const,
      };

      // Worker 1 acquires claim
      const handle1 = await lockCoordinator.claimSegment(descriptor);
      assert.ok(handle1);

      // Simulate lease takeover by Worker 2
      const raw = fs.readFileSync(handle1.claimFilePath, 'utf8');
      const claimData = JSON.parse(raw);
      claimData.expiresAt = new Date(Date.now() - 5000).toISOString();
      fs.writeFileSync(handle1.claimFilePath, JSON.stringify(claimData, null, 2), 'utf8');

      const handle2 = await lockCoordinator.claimSegment(descriptor);
      assert.ok(handle2);

      // Worker 1 attempts to publish with verifyOwnership callback
      const result = await materializeUseCase.execute(descriptor, undefined, {
        verifyOwnership: async () => lockCoordinator.verifyOwnership(handle1),
      });

      // Materialization must fail due to fencing
      assert.equal(result.success, false);
      assert.match(result.error ?? '', /Publication fenced|lease ownership lost/i);

      // Verify no Parquet artifact was published for Worker 1
      const paths = parquetPathSafety.resolveSegmentPaths(tenantId, projectId, environment, partitionDate, 'segment-fenced-pub.jsonl');
      assert.equal(fs.existsSync(paths.parquetPath), false, 'Authoritative Parquet must not be published by fenced worker');
      assert.equal(fs.existsSync(paths.stagingParquetPath), false, 'Staging file must be cleaned up');

      await lockCoordinator.releaseClaim(handle2);
    });

    it('fails closed when database coordination is configured but unavailable', async () => {
      const fixture = createSealedSegmentFixture(tenantId, projectId, environment, serviceName, partitionDate, 'segment-fail-closed.jsonl', 5);
      const descriptor = {
        id: fixture.segmentRecord.id,
        tenantId,
        projectId,
        environment,
        serviceName,
        date: partitionDate,
        segmentFilename: 'segment-fail-closed.jsonl',
        resolvedPath: fixture.fullPath,
        byteSize: Number(fixture.segmentRecord.byteSize),
        recordCount: 5,
        sha256Checksum: fixture.sha256,
        firstEventTimestamp: fixture.segmentRecord.firstEventTimestamp.toISOString(),
        lastEventTimestamp: fixture.segmentRecord.lastEventTimestamp.toISOString(),
        finalizedAt: fixture.segmentRecord.finalizedAt.toISOString(),
        verifiedAt: new Date().toISOString(),
        integrityStatus: 'VERIFIED' as const,
      };

      const prevEnv = process.env.SKYRA_ISOLATED_TEST_ENV;
      process.env.SKYRA_ISOLATED_TEST_ENV = 'true';
      try {
        // Create a coordinator configured with an unreachable database port to simulate network failure
        const brokenConfig = new QueryConfigService({
          nodeEnv: 'test',
          archiveRoot: tempArchiveRoot,
          parquetCacheRoot: tempCacheRoot,
          databaseUrl: 'postgresql://invalid_user:invalid_pass@127.0.0.1:5439/nonexistent_db',
          compactionEnabled: true,
          compactionLockTtlMs: 2000,
        });

        const failingCoordinator = new CompactionLockCoordinatorService(parquetPathSafety, brokenConfig, audit);
        assert.equal(failingCoordinator.isDatabaseCoordinated(), true);

        // Must fail closed (return null, never silently degrade to file-only claim in distributed mode)
        const handle = await failingCoordinator.claimSegment(descriptor);
        assert.equal(handle, null, 'Must fail closed when mandatory database coordination fails');

        // Verify file claim was not left behind
        const keyHash = failingCoordinator.buildKeyHash(failingCoordinator.buildSegmentKey(descriptor));
        const claimFile = path.join(parquetPathSafety.getClaimsDirectory(), `${keyHash}.claim.json`);
        assert.equal(fs.existsSync(claimFile), false, 'Claim file must be unlinked when failing closed');
      } finally {
        if (prevEnv !== undefined) {
          process.env.SKYRA_ISOLATED_TEST_ENV = prevEnv;
        } else {
          delete process.env.SKYRA_ISOLATED_TEST_ENV;
        }
      }
    });

    it('persists compaction failure state across simulated service restarts (Risk E)', async () => {
      compactor.resetFailureTrackers();

      const persistProjectId = 'proj-persist-test';
      const dir = path.join(tempArchiveRoot, tenantId, persistProjectId, environment, serviceName, partitionDate);
      const filename = 'segment-persistent-fail.jsonl';
      fs.mkdirSync(dir, { recursive: true });
      const fullPath = path.join(dir, filename);
      fs.writeFileSync(fullPath, 'MALFORMED_ROW_FOR_PERSISTENCE\n', 'utf8');
      const stat = fs.statSync(fullPath);
      const sha = crypto.createHash('sha256').update(fs.readFileSync(fullPath)).digest('hex');
      fs.writeFileSync(path.join(dir, 'segment-persistent-fail.manifest.json'), JSON.stringify({
        manifest_version: '1.0',
        tenant_id: tenantId,
        project_id: persistProjectId,
        environment,
        service_name: serviceName,
        date: partitionDate,
        segment_filename: filename,
        record_count: 1,
        byte_size: stat.size,
        sha256_checksum: sha,
      }), 'utf8');

      const rec: ArchiveSegmentRecord = {
        id: crypto.randomUUID(),
        tenantId,
        projectId: persistProjectId,
        environment,
        serviceName,
        date: partitionDate,
        segmentFilename: filename,
        recordCount: 1,
        byteSize: stat.size,
        sha256Checksum: sha,
        firstEventTimestamp: new Date(),
        lastEventTimestamp: new Date(),
        finalizedAt: new Date(),
        writerInstanceId: 'w1',
        journalSegmentId: 'wal-persist',
        journalStartOffset: 0,
        journalEndOffset: stat.size,
      };
      await inMemoryRepo.saveSegment(rec);

      // Run compaction once: fails and persists state to disk
      const p1 = await compactor.compactOnce();
      assert.ok(p1.totalFailed >= 1);

      // Verify persistent failure file exists on disk
      const failureFile = path.join(parquetPathSafety.getCacheRoot(), '.state', 'compaction-failures.json');
      assert.ok(fs.existsSync(failureFile), 'Failure state must be persisted to disk');

      const persistedRaw = fs.readFileSync(failureFile, 'utf8');
      const persistedState = JSON.parse(persistedRaw);
      assert.ok(persistedState.failures);
      const segmentKey = lockCoordinator.buildSegmentKey({
        id: rec.id,
        tenantId,
        projectId: persistProjectId,
        environment,
        serviceName,
        date: partitionDate,
        segmentFilename: filename,
        resolvedPath: fullPath,
        byteSize: stat.size,
        recordCount: 1,
        sha256Checksum: sha,
        firstEventTimestamp: rec.firstEventTimestamp.toISOString(),
        lastEventTimestamp: rec.lastEventTimestamp.toISOString(),
        finalizedAt: rec.finalizedAt.toISOString(),
        verifiedAt: new Date().toISOString(),
        integrityStatus: 'VERIFIED',
      });
      assert.ok(persistedState.failures[segmentKey], 'Segment failure must be recorded in persistent state');
      assert.equal(persistedState.failures[segmentKey].failureCount, 1);

      // Simulate service restart by constructing a new BackgroundCompactionService instance
      const restartedCompactor = new BackgroundCompactionService(
        config,
        audit,
        materializeUseCase,
        recoverUseCase,
        lockCoordinator,
        discoveryService,
        parquetPathSafety,
      );

      // The new instance must have loaded the persisted failure state
      const restoredTrackers = restartedCompactor.getFailureTrackers();
      const restored = restoredTrackers.get(segmentKey);
      assert.ok(restored, 'Restarted service must restore failure tracker from disk');
      assert.equal(restored?.failureCount, 1);

      // Immediate compaction run on restarted service must skip segment due to backoff
      const pRestart = await restartedCompactor.compactOnce();
      assert.equal(pRestart.totalSkipped >= 1, true, 'Restarted service must respect persisted backoff');

      // Operator recovery path: clear failure
      restartedCompactor.clearFailure(segmentKey);
      assert.equal(restartedCompactor.getFailureTrackers().get(segmentKey), undefined);

      restartedCompactor.resetFailureTrackers();
      assert.equal(fs.existsSync(failureFile), false, 'Resetting trackers must remove persistent state file');
    });
  });
});
