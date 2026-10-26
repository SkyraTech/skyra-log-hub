import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { DuckDbInstanceManager } from '../../src/modules/query-execution/infrastructure/duckdb/duckdb-instance.manager.js';
import { SqlGeneratorService } from '../../src/modules/query-execution/application/sql-generator.service.js';
import { AnalyticsSqlGeneratorService } from '../../src/modules/query-execution/application/analytics-sql-generator.service.js';
import { QueryResourceGovernorService } from '../../src/modules/query-execution/infrastructure/duckdb/query-resource-governor.service.js';
import { DuckDbLogQueryAdapter } from '../../src/modules/query-execution/infrastructure/duckdb/duckdb-query-adapter.js';
import { QueryConfigService } from '../../src/config/query-config.service.js';
import { QueryAuditService } from '../../src/modules/audit/query-audit.service.js';
import type { AuthorizedAggregationPlan } from '../../src/modules/analytics/domain/aggregation.model.js';
import type { AuthorizedFacetsPlan } from '../../src/modules/analytics/domain/facet.model.js';
import type { TrustedArchiveSegmentDescriptor } from '../../src/modules/archive-discovery/domain/archive-segment-descriptor.model.js';
import {
  CrossTenantViolationException,
  ForbiddenProjectException,
  ArchiveIntegrityException,
  ArchiveNotFoundException,
} from '../../src/common/errors/query.errors.js';

describe('Analytics Security, Provenance & P0-A/P0-B Invariant Tests (LOGHUB-QUERY-005)', () => {
  let tempDir: string;
  let tenantAFile: string;
  let tenantBFile: string;
  let largeBenchmarkFile: string;
  let instanceManager: DuckDbInstanceManager;
  let adapter: DuckDbLogQueryAdapter;
  let sqlGenerator: SqlGeneratorService;
  let analyticsSqlGenerator: AnalyticsSqlGeneratorService;

  const tenantA = '00000000-0000-0000-0000-000000000001';
  const tenantB = '00000000-0000-0000-0000-000000000002';
  const projectA = 'proj-alpha';
  const projectB = 'proj-beta';

  before(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyra-analytics-security-'));
    tenantAFile = path.join(tempDir, 'tenant-a.jsonl');
    tenantBFile = path.join(tempDir, 'tenant-b.jsonl');
    largeBenchmarkFile = path.join(tempDir, 'benchmark-5k.jsonl');

    // Tenant A events
    const eventsA = [
      {
        '@timestamp': '2026-10-26T10:00:00.000Z',
        'ecs.version': '8.11.0',
        event: { id: 'a-1', action: 'auth.login' },
        log: { level: 'info' },
        message: 'Tenant A record',
        service: { name: 'core-api', environment: 'production' },
        skyra: { project_id: projectA, tenant_id: tenantA, schema_version: '1.0.0' },
      },
    ];
    fs.writeFileSync(tenantAFile, eventsA.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf8');

    // Tenant B events
    const eventsB = [
      {
        '@timestamp': '2026-10-26T10:00:00.000Z',
        'ecs.version': '8.11.0',
        event: { id: 'b-1', action: 'auth.login' },
        log: { level: 'fatal' },
        message: 'Tenant B confidential record',
        service: { name: 'core-api', environment: 'production' },
        skyra: { project_id: projectB, tenant_id: tenantB, schema_version: '1.0.0' },
      },
    ];
    fs.writeFileSync(tenantBFile, eventsB.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf8');

    // Large benchmark file with 5,000 records
    const benchRecords: string[] = [];
    const baseEpoch = Date.parse('2026-10-26T00:00:00.000Z');
    const levels = ['info', 'warn', 'error', 'debug'];
    const services = ['frontend', 'auth', 'payment', 'shipping', 'inventory'];

    for (let i = 0; i < 5000; i++) {
      const ts = new Date(baseEpoch + i * 2000).toISOString();
      const rec = {
        '@timestamp': ts,
        'ecs.version': '8.11.0',
        event: { id: `bench-${String(i).padStart(5, '0')}`, action: i % 2 === 0 ? 'read' : 'write' },
        log: { level: levels[i % levels.length] },
        message: `Benchmark log entry ${i}`,
        service: { name: services[i % services.length], environment: 'production' },
        skyra: { project_id: projectA, tenant_id: tenantA, schema_version: '1.0.0' },
      };
      benchRecords.push(JSON.stringify(rec));
    }
    fs.writeFileSync(largeBenchmarkFile, benchRecords.join('\n') + '\n', 'utf8');

    const config = new QueryConfigService();
    instanceManager = new DuckDbInstanceManager(config);
    await instanceManager.initialize();

    sqlGenerator = new SqlGeneratorService();
    analyticsSqlGenerator = new AnalyticsSqlGeneratorService(sqlGenerator);
    const governor = new QueryResourceGovernorService();
    const audit = new QueryAuditService(config);

    adapter = new DuckDbLogQueryAdapter(
      instanceManager,
      sqlGenerator,
      governor,
      audit,
      analyticsSqlGenerator,
    );
  });

  after(async () => {
    if (instanceManager) {
      await instanceManager.shutdown();
    }
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  const makeDescriptor = (
    filePath: string,
    id: string,
    tenant: string,
    project: string,
    integrityStatus: 'VERIFIED' | 'MISSING' | 'CORRUPT' = 'VERIFIED',
  ): TrustedArchiveSegmentDescriptor => {
    const stat = fs.existsSync(filePath) ? fs.statSync(filePath) : { size: 100 };
    return {
      id,
      tenantId: tenant,
      projectId: project,
      environment: 'production',
      serviceName: 'core-api',
      date: '2026-10-26',
      segmentFilename: path.basename(filePath),
      resolvedPath: filePath,
      recordCount: 1,
      byteSize: stat.size,
      sha256Checksum: 'dummy-sha',
      firstEventTimestamp: '2026-10-26T00:00:00.000Z',
      lastEventTimestamp: '2026-10-26T12:00:00.000Z',
      finalizedAt: '2026-10-26T12:05:00.000Z',
      verifiedAt: '2026-10-26T12:10:00.000Z',
      integrityStatus,
    };
  };

  // ==========================================
  // P0-A: STABLE RECORD LOCATOR ASSESSMENT
  // ==========================================

  it('P0-A: row_number() window function has deterministic inner ORDER BY for physical stability', () => {
    const desc = makeDescriptor(tenantAFile, 'seg-1', tenantA, projectA);
    const plan = {
      queryId: 'test-p0a',
      tenantId: tenantA,
      authorizedProjects: [projectA],
      descriptors: [desc],
      timeInterval: { startInclusive: '2026-10-26T00:00:00.000Z', endExclusive: '2026-10-26T12:00:00.000Z' },
      sort: { field: '@timestamp' as const, direction: 'desc' as const },
      limit: 10,
      resourceBudget: { maxSegments: 10, maxScannedBytes: 100000, maxRows: 100, timeoutMs: 5000, memoryBudgetMb: 256 },
    };

    const sql = sqlGenerator.generate(plan).sql;

    // Must verify inner ordering clause inside row_number()
    assert.ok(
      sql.includes(`row_number() OVER (PARTITION BY filename ORDER BY json_extract_string(json, '$."@timestamp"'), json_extract_string(json, '$.event.id'), md5(json))`),
      'SQL must include deterministic inner order in row_number() window function to prevent multi-threaded thread race re-ordering',
    );
  });

  // ==========================================
  // P0-B: PRE-READ DESCRIPTOR PROVENANCE GATE
  // ==========================================

  it('P0-B.1: Pre-read gate rejects forged descriptor with foreign tenant before DuckDB invocation', async () => {
    const foreignDesc = makeDescriptor(tenantBFile, 'forged-seg-1', tenantB, projectB);

    const plan: AuthorizedAggregationPlan = {
      queryId: 'attack-cross-tenant',
      tenantId: tenantA, // Caller is Tenant A
      authorizedProjects: [projectA],
      descriptors: [foreignDesc], // Injected Tenant B descriptor
      timeInterval: { startInclusive: '2026-10-26T00:00:00.000Z', endExclusive: '2026-10-26T12:00:00.000Z' },
      aggregations: [{ name: 'test', type: 'terms', field: 'log.level' }],
      resourceBudget: { maxSegments: 10, maxScannedBytes: 100000, timeoutMs: 5000 },
    };

    await assert.rejects(
      async () => adapter.executeAggregation(plan),
      (err: unknown) => {
        assert.ok(err instanceof CrossTenantViolationException);
        assert.ok((err as CrossTenantViolationException).message.includes('Pre-read isolation violation'));
        return true;
      },
    );
  });

  it('P0-B.2: Pre-read gate rejects descriptor with unauthorized project ID', async () => {
    const unauthProjectDesc = makeDescriptor(tenantAFile, 'seg-secret', tenantA, 'payroll-confidential');

    const plan: AuthorizedFacetsPlan = {
      queryId: 'attack-forbidden-project',
      tenantId: tenantA,
      authorizedProjects: [projectA], // Only projectA authorized
      descriptors: [unauthProjectDesc], // Payroll injected
      timeInterval: { startInclusive: '2026-10-26T00:00:00.000Z', endExclusive: '2026-10-26T12:00:00.000Z' },
      facetFields: ['service.name'],
      resourceBudget: { maxSegments: 10, maxScannedBytes: 100000, timeoutMs: 5000 },
    };

    await assert.rejects(
      async () => adapter.executeFacets(plan),
      (err: unknown) => {
        assert.ok(err instanceof ForbiddenProjectException);
        assert.ok((err as ForbiddenProjectException).message.includes('not in caller\'s authorized scope'));
        return true;
      },
    );
  });

  it('P0-B.3: Pre-read gate rejects unverified or tampered descriptor status', async () => {
    const corruptDesc = makeDescriptor(tenantAFile, 'seg-corrupt', tenantA, projectA, 'CORRUPT');

    const plan: AuthorizedAggregationPlan = {
      queryId: 'tampered-descriptor',
      tenantId: tenantA,
      authorizedProjects: [projectA],
      descriptors: [corruptDesc],
      timeInterval: { startInclusive: '2026-10-26T00:00:00.000Z', endExclusive: '2026-10-26T12:00:00.000Z' },
      aggregations: [{ name: 'test', type: 'terms', field: 'log.level' }],
      resourceBudget: { maxSegments: 10, maxScannedBytes: 100000, timeoutMs: 5000 },
    };

    await assert.rejects(
      async () => adapter.executeAggregation(plan),
      (err: unknown) => {
        assert.ok(err instanceof ArchiveIntegrityException);
        return true;
      },
    );
  });

  it('P0-B.4: Pre-read gate verifies byte size matches filesystem before query starts', async () => {
    const badSizeDesc: TrustedArchiveSegmentDescriptor = {
      ...makeDescriptor(tenantAFile, 'seg-bad-size', tenantA, projectA),
      byteSize: 999999999, // Tampered byte size
    };

    const plan: AuthorizedAggregationPlan = {
      queryId: 'size-mismatch',
      tenantId: tenantA,
      authorizedProjects: [projectA],
      descriptors: [badSizeDesc],
      timeInterval: { startInclusive: '2026-10-26T00:00:00.000Z', endExclusive: '2026-10-26T12:00:00.000Z' },
      aggregations: [{ name: 'test', type: 'terms', field: 'log.level' }],
      resourceBudget: { maxSegments: 10, maxScannedBytes: 100000, timeoutMs: 5000 },
    };

    await assert.rejects(
      async () => adapter.executeAggregation(plan),
      (err: unknown) => {
        assert.ok(err instanceof ArchiveIntegrityException);
        assert.ok((err as ArchiveIntegrityException).message.includes('Pre-read file identity mismatch'));
        return true;
      },
    );
  });

  // ==========================================
  // PERFORMANCE BENCHMARK (5,000 JSONL RECORDS)
  // ==========================================

  it('PERF-1: Benchmark 5,000 record aggregation and facet extraction', async () => {
    const desc = makeDescriptor(largeBenchmarkFile, 'bench-seg', tenantA, projectA);

    const aggPlan: AuthorizedAggregationPlan = {
      queryId: 'bench-agg-1',
      tenantId: tenantA,
      authorizedProjects: [projectA],
      descriptors: [desc],
      timeInterval: { startInclusive: '2026-10-26T00:00:00.000Z', endExclusive: '2026-10-26T12:00:00.000Z' },
      aggregations: [
        { name: 'severity_dist', type: 'terms', field: 'log.level', size: 10 },
        { name: 'service_dist', type: 'terms', field: 'service.name', size: 10 },
        { name: 'hourly_buckets', type: 'date_histogram', interval: '1h' },
      ],
      resourceBudget: { maxSegments: 10, maxScannedBytes: 50_000_000, timeoutMs: 30000 },
    };

    const startTime = process.hrtime.bigint();
    const result = await adapter.executeAggregation(aggPlan);
    const durationMs = Number(process.hrtime.bigint() - startTime) / 1_000_000;

    assert.ok(result.aggregations['severity_dist']);
    assert.ok(result.aggregations['service_dist']);
    assert.ok(result.aggregations['hourly_buckets']);

    // 5000 records / 4 severities = 1250 each
    const buckets = (result.aggregations['severity_dist'] as unknown as { buckets: readonly { key: string; count: number }[] }).buckets;
    const totalCount = buckets.reduce((sum, b) => sum + b.count, 0);
    assert.equal(totalCount, 5000);

    console.log(`[PERF_BENCHMARK] 5,000 JSONL record analytical aggregation: ${durationMs.toFixed(2)}ms`);
    assert.ok(durationMs < 5000, '5,000 JSONL aggregation should complete well under 5 seconds');
  });
});
