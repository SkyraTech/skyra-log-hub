import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { DuckDbInstanceManager } from '../../src/modules/query-execution/infrastructure/duckdb/duckdb-instance.manager.js';
import { SqlGeneratorService } from '../../src/modules/query-execution/application/sql-generator.service.js';
import { QueryResourceGovernorService } from '../../src/modules/query-execution/infrastructure/duckdb/query-resource-governor.service.js';
import { DuckDbLogQueryAdapter } from '../../src/modules/query-execution/infrastructure/duckdb/duckdb-query-adapter.js';
import { QueryConfigService } from '../../src/config/query-config.service.js';
import { QueryAuditService } from '../../src/modules/audit/query-audit.service.js';
import { ParquetPathSafetyService } from '../../src/modules/parquet-cache/infrastructure/filesystem/parquet-path-safety.service.js';
import {
  CrossTenantViolationException,
  ForbiddenProjectException,
  ArchiveIntegrityException,
  PathTraversalException,
} from '../../src/common/errors/query.errors.js';
import type { AuthorizedLogQueryPlan } from '../../src/modules/query-execution/domain/authorized-query-plan.model.js';
import type { TrustedParquetSegmentDescriptor } from '../../src/modules/parquet-cache/domain/parquet-segment.model.js';

describe('Parquet Pre-Open Security & Fault Injection Tests (LOGHUB-QUERY-006)', () => {
  let tempCacheRoot: string;
  let instanceManager: DuckDbInstanceManager;
  let adapter: DuckDbLogQueryAdapter;
  let pathSafety: ParquetPathSafetyService;

  const tenantVictim = '00000000-0000-4000-8000-000000000001';
  const tenantAttacker = '00000000-0000-4000-8000-000000000002';
  const projectPublic = 'proj-public';
  const projectSecret = 'proj-secret-payroll';

  let validParquetPath: string;
  let validFileSize: number;

  before(async () => {
    tempCacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skyra-parquet-sec-'));
    const config = new QueryConfigService({
      nodeEnv: 'test',
      parquetCacheRoot: tempCacheRoot,
      parquetCacheEnabled: true,
    });

    instanceManager = new DuckDbInstanceManager(config);
    await instanceManager.initialize();

    const sqlGen = new SqlGeneratorService();
    const governor = new QueryResourceGovernorService();
    const audit = new QueryAuditService(config);
    pathSafety = new ParquetPathSafetyService(config);

    adapter = new DuckDbLogQueryAdapter(instanceManager, sqlGen, governor, audit, undefined, pathSafety);

    // Create a real parquet file for valid size check
    const paths = pathSafety.resolveSegmentPaths(tenantVictim, projectPublic, 'production', '2026-10-25', 'valid.jsonl');
    fs.mkdirSync(paths.directory, { recursive: true });
    validParquetPath = paths.parquetPath;
    fs.writeFileSync(validParquetPath, 'PAR1-test-parquet-dummy-content-12345');
    validFileSize = fs.statSync(validParquetPath).size;
  });

  after(async () => {
    if (instanceManager) {
      await instanceManager.shutdown();
    }
    try {
      fs.rmSync(tempCacheRoot, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  const makeBasePlan = (tenant: string, projects: string[]): AuthorizedLogQueryPlan => ({
    queryId: 'sec-q-1',
    tenantId: tenant,
    authorizedProjects: projects,
    timeInterval: {
      startInclusive: '2026-10-25T00:00:00.000Z',
      endExclusive: '2026-10-25T23:59:59.000Z',
    },
    sort: { field: '@timestamp', direction: 'asc' },
    limit: 10,
    resourceBudget: {
      maxSegments: 100,
      maxScannedBytes: 50_000_000,
      maxRows: 100,
      timeoutMs: 30000,
      memoryBudgetMb: 256,
    },
    descriptors: [],
    parquetDescriptors: [],
  });

  it('SEC-1: should reject cross-tenant Parquet descriptor BEFORE DuckDB opens it', async () => {
    const maliciousDescriptor: TrustedParquetSegmentDescriptor = {
      id: 'pq-victim-seg',
      canonicalSegmentId: 'valid.jsonl',
      tenantId: tenantVictim, // Victim tenant!
      projectId: projectPublic,
      environment: 'production',
      date: '2026-10-25',
      segmentFilename: 'valid.jsonl',
      parquetFilename: 'valid.parquet',
      resolvedPath: validParquetPath,
      byteSize: validFileSize,
      recordCount: 1,
      sha256Checksum: 'dummy',
      sourceChecksum: 'dummy',
      materializationVersion: '1.0.0',
      integrityStatus: 'VERIFIED',
      verifiedAt: new Date().toISOString(),
    };

    const attackerPlan = makeBasePlan(tenantAttacker, [projectPublic]);
    const planWithMaliciousParquet: AuthorizedLogQueryPlan = {
      ...attackerPlan,
      parquetDescriptors: [maliciousDescriptor],
    };

    await assert.rejects(
      async () => adapter.execute(planWithMaliciousParquet),
      CrossTenantViolationException,
      'Pre-read gate must throw CrossTenantViolationException before DuckDB opens cross-tenant parquet file',
    );
  });

  it('SEC-2: should reject Parquet descriptor for unauthorized project within same tenant', async () => {
    const unauthorizedProjectDescriptor: TrustedParquetSegmentDescriptor = {
      id: 'pq-secret-seg',
      canonicalSegmentId: 'valid.jsonl',
      tenantId: tenantVictim,
      projectId: projectSecret, // Secret project caller is NOT authorized for!
      environment: 'production',
      date: '2026-10-25',
      segmentFilename: 'valid.jsonl',
      parquetFilename: 'valid.parquet',
      resolvedPath: validParquetPath,
      byteSize: validFileSize,
      recordCount: 1,
      sha256Checksum: 'dummy',
      sourceChecksum: 'dummy',
      materializationVersion: '1.0.0',
      integrityStatus: 'VERIFIED',
      verifiedAt: new Date().toISOString(),
    };

    const callerPlan = makeBasePlan(tenantVictim, [projectPublic]); // Only authorized for projectPublic
    const planWithUnauthorizedProject: AuthorizedLogQueryPlan = {
      ...callerPlan,
      parquetDescriptors: [unauthorizedProjectDescriptor],
    };

    await assert.rejects(
      async () => adapter.execute(planWithUnauthorizedProject),
      ForbiddenProjectException,
      'Pre-read gate must reject Parquet descriptor for unauthorized project',
    );
  });

  it('SEC-3: should reject unverified Parquet descriptor (status != VERIFIED)', async () => {
    const unverifiedDescriptor: TrustedParquetSegmentDescriptor = {
      id: 'pq-unverified-seg',
      canonicalSegmentId: 'valid.jsonl',
      tenantId: tenantVictim,
      projectId: projectPublic,
      environment: 'production',
      date: '2026-10-25',
      segmentFilename: 'valid.jsonl',
      parquetFilename: 'valid.parquet',
      resolvedPath: validParquetPath,
      byteSize: validFileSize,
      recordCount: 1,
      sha256Checksum: 'dummy',
      sourceChecksum: 'dummy',
      materializationVersion: '1.0.0',
      integrityStatus: 'MISSING', // Not VERIFIED!
      verifiedAt: new Date().toISOString(),
    };

    const plan = makeBasePlan(tenantVictim, [projectPublic]);
    await assert.rejects(
      async () => adapter.execute({ ...plan, parquetDescriptors: [unverifiedDescriptor] }),
      ArchiveIntegrityException,
    );
  });

  it('SEC-4: should reject Parquet path escaping cache root', async () => {
    const escapedDescriptor: TrustedParquetSegmentDescriptor = {
      id: 'pq-escaped-seg',
      canonicalSegmentId: 'evil.jsonl',
      tenantId: tenantVictim,
      projectId: projectPublic,
      environment: 'production',
      date: '2026-10-25',
      segmentFilename: 'evil.jsonl',
      parquetFilename: 'evil.parquet',
      resolvedPath: path.resolve(tempCacheRoot, '..', 'evil.parquet'),
      byteSize: 100,
      recordCount: 1,
      sha256Checksum: 'dummy',
      sourceChecksum: 'dummy',
      materializationVersion: '1.0.0',
      integrityStatus: 'VERIFIED',
      verifiedAt: new Date().toISOString(),
    };

    const plan = makeBasePlan(tenantVictim, [projectPublic]);
    await assert.rejects(
      async () => adapter.execute({ ...plan, parquetDescriptors: [escapedDescriptor] }),
      PathTraversalException,
    );
  });

  it('SEC-5: should reject Parquet descriptor if file size on disk differs from descriptor', async () => {
    const tamperedDescriptor: TrustedParquetSegmentDescriptor = {
      id: 'pq-tampered-seg',
      canonicalSegmentId: 'valid.jsonl',
      tenantId: tenantVictim,
      projectId: projectPublic,
      environment: 'production',
      date: '2026-10-25',
      segmentFilename: 'valid.jsonl',
      parquetFilename: 'valid.parquet',
      resolvedPath: validParquetPath,
      byteSize: validFileSize + 9999, // Tampered byte count!
      recordCount: 1,
      sha256Checksum: 'dummy',
      sourceChecksum: 'dummy',
      materializationVersion: '1.0.0',
      integrityStatus: 'VERIFIED',
      verifiedAt: new Date().toISOString(),
    };

    const plan = makeBasePlan(tenantVictim, [projectPublic]);
    await assert.rejects(
      async () => adapter.execute({ ...plan, parquetDescriptors: [tamperedDescriptor] }),
      ArchiveIntegrityException,
    );
  });
});
