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
import { ParquetPathSafetyService } from '../../src/modules/parquet-cache/infrastructure/filesystem/parquet-path-safety.service.js';
import { DuckDbParquetConverter } from '../../src/modules/parquet-cache/infrastructure/duckdb/duckdb-parquet-converter.js';
import { FileParquetCatalogService } from '../../src/modules/parquet-cache/infrastructure/catalog/file-parquet-catalog.service.js';
import { MaterializeSegmentUseCase } from '../../src/modules/parquet-cache/application/materialize-segment.use-case.js';
import type { AuthorizedAggregationPlan } from '../../src/modules/analytics/domain/aggregation.model.js';
import type { AuthorizedFacetsPlan } from '../../src/modules/analytics/domain/facet.model.js';
import type { TrustedArchiveSegmentDescriptor } from '../../src/modules/archive-discovery/domain/archive-segment-descriptor.model.js';
import type { TrustedParquetSegmentDescriptor } from '../../src/modules/parquet-cache/domain/parquet-segment.model.js';

describe('Hybrid Analytics & Facet Parity Tests (LOGHUB-QUERY-006)', () => {
  let tempArchiveRoot: string;
  let tempCacheRoot: string;
  let instanceManager: DuckDbInstanceManager;
  let adapter: DuckDbLogQueryAdapter;

  const tenantId = '00000000-0000-4000-8000-000000000001';
  const projectId = 'proj-analytics';
  const environment = 'production';
  const serviceName = 'analytics-svc';
  const date = '2026-10-25';

  let seg1Jsonl: TrustedArchiveSegmentDescriptor;
  let seg2Jsonl: TrustedArchiveSegmentDescriptor;
  let seg1Parquet: TrustedParquetSegmentDescriptor;
  let seg2Parquet: TrustedParquetSegmentDescriptor;

  const createEvent = (ts: string, id: string, level: string, sName: string) => ({
    '@timestamp': ts,
    'ecs.version': '8.11.0',
    event: { id, action: 'analytics.test' },
    log: { level },
    message: `Event ${id} for ${sName}`,
    service: { name: sName, environment },
    skyra: { project_id: projectId, tenant_id: tenantId, schema_version: '1.0.0' },
  });

  before(async () => {
    tempArchiveRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skyra-hybrid-ana-arch-'));
    tempCacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skyra-hybrid-ana-cache-'));

    const config = new QueryConfigService({
      nodeEnv: 'test',
      archiveRoot: tempArchiveRoot,
      parquetCacheRoot: tempCacheRoot,
      parquetCacheEnabled: true,
      parquetMaterializationEnabled: true,
    });

    instanceManager = new DuckDbInstanceManager(config);
    await instanceManager.initialize();

    const sqlGen = new SqlGeneratorService();
    const anaSqlGen = new AnalyticsSqlGeneratorService(sqlGen);
    const governor = new QueryResourceGovernorService();
    const audit = new QueryAuditService(config);
    const pathSafety = new ParquetPathSafetyService(config);
    const catalog = new FileParquetCatalogService(pathSafety, config, audit);
    const converter = new DuckDbParquetConverter(instanceManager, pathSafety);
    const materializeUseCase = new MaterializeSegmentUseCase(catalog, converter, audit, config);

    adapter = new DuckDbLogQueryAdapter(instanceManager, sqlGen, governor, audit, anaSqlGen);

    const segDir = path.join(tempArchiveRoot, tenantId, projectId, environment, date);
    fs.mkdirSync(segDir, { recursive: true });

    const seg1Events = [
      createEvent('2026-10-25T10:00:00.000Z', 'e1', 'info', 'auth-service'),
      createEvent('2026-10-25T10:05:00.000Z', 'e2', 'info', 'auth-service'),
      createEvent('2026-10-25T10:10:00.000Z', 'e3', 'warn', 'billing-service'),
      createEvent('2026-10-25T10:15:00.000Z', 'e4', 'error', 'billing-service'),
    ];

    const seg2Events = [
      createEvent('2026-10-25T10:20:00.000Z', 'e5', 'error', 'payment-service'),
      createEvent('2026-10-25T10:25:00.000Z', 'e6', 'info', 'payment-service'),
      createEvent('2026-10-25T10:30:00.000Z', 'e7', 'warn', 'auth-service'),
      createEvent('2026-10-25T10:35:00.000Z', 'e8', 'error', 'auth-service'),
    ];

    const seg1Path = path.join(segDir, 'segment-0001.jsonl');
    const seg2Path = path.join(segDir, 'segment-0002.jsonl');

    const s1Raw = seg1Events.map((e) => JSON.stringify(e)).join('\n') + '\n';
    const s2Raw = seg2Events.map((e) => JSON.stringify(e)).join('\n') + '\n';

    fs.writeFileSync(seg1Path, s1Raw, 'utf8');
    fs.writeFileSync(seg2Path, s2Raw, 'utf8');

    seg1Jsonl = {
      id: 's1',
      tenantId,
      projectId,
      environment,
      serviceName,
      date,
      segmentFilename: 'segment-0001.jsonl',
      resolvedPath: seg1Path,
      byteSize: Buffer.byteLength(s1Raw),
      recordCount: 4,
      sha256Checksum: crypto.createHash('sha256').update(s1Raw).digest('hex'),
      firstEventTimestamp: '2026-10-25T10:00:00Z',
      lastEventTimestamp: '2026-10-25T10:15:00Z',
      finalizedAt: '2026-10-25T10:20:00Z',
      verifiedAt: '2026-10-25T10:20:00Z',
      integrityStatus: 'VERIFIED',
    };

    seg2Jsonl = {
      id: 's2',
      tenantId,
      projectId,
      environment,
      serviceName,
      date,
      segmentFilename: 'segment-0002.jsonl',
      resolvedPath: seg2Path,
      byteSize: Buffer.byteLength(s2Raw),
      recordCount: 4,
      sha256Checksum: crypto.createHash('sha256').update(s2Raw).digest('hex'),
      firstEventTimestamp: '2026-10-25T10:20:00Z',
      lastEventTimestamp: '2026-10-25T10:35:00Z',
      finalizedAt: '2026-10-25T10:40:00Z',
      verifiedAt: '2026-10-25T10:40:00Z',
      integrityStatus: 'VERIFIED',
    };

    const mat1 = await materializeUseCase.execute(seg1Jsonl);
    const mat2 = await materializeUseCase.execute(seg2Jsonl);

    seg1Parquet = mat1.parquetDescriptor!;
    seg2Parquet = mat2.parquetDescriptor!;
  });

  after(async () => {
    if (instanceManager) {
      await instanceManager.shutdown();
    }
    try {
      fs.rmSync(tempArchiveRoot, { recursive: true, force: true });
      fs.rmSync(tempCacheRoot, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  const baseBudget = {
    maxSegments: 100,
    maxScannedBytes: 50_000_000,
    timeoutMs: 30000,
  };

  it('ANA-1: Date histogram aggregation parity across JSONL, Parquet and Hybrid execution', async () => {
    const planBase = {
      queryId: 'ana-dh-1',
      tenantId,
      authorizedProjects: [projectId],
      timeInterval: {
        startInclusive: '2026-10-25T09:00:00.000Z',
        endExclusive: '2026-10-25T11:00:00.000Z',
      },
      aggregations: [
        {
          name: 'dh_test',
          type: 'date_histogram' as const,
          interval: '15m' as const,
        },
      ],
      resourceBudget: baseBudget,
    };

    const resJsonl = await adapter.executeAggregation({ ...planBase, descriptors: [seg1Jsonl, seg2Jsonl], parquetDescriptors: [] });
    const resParquet = await adapter.executeAggregation({ ...planBase, descriptors: [], parquetDescriptors: [seg1Parquet, seg2Parquet] });
    const resHybrid = await adapter.executeAggregation({ ...planBase, descriptors: [seg2Jsonl], parquetDescriptors: [seg1Parquet] });

    assert.ok(resJsonl.aggregations['dh_test']);
    assert.ok(resParquet.aggregations['dh_test']);
    assert.ok(resHybrid.aggregations['dh_test']);

    const bJsonl = (resJsonl.aggregations['dh_test'] as any).buckets;
    const bParquet = (resParquet.aggregations['dh_test'] as any).buckets;
    const bHybrid = (resHybrid.aggregations['dh_test'] as any).buckets;

    assert.equal(bParquet.length, bJsonl.length);
    assert.equal(bHybrid.length, bJsonl.length);

    for (let i = 0; i < bJsonl.length; i++) {
      assert.equal(bParquet[i].timestamp, bJsonl[i].timestamp);
      assert.equal(bHybrid[i].timestamp, bJsonl[i].timestamp);
      assert.equal(bParquet[i].count, bJsonl[i].count);
      assert.equal(bHybrid[i].count, bJsonl[i].count);
    }
  });

  it('ANA-2: Terms aggregation parity across JSONL, Parquet and Hybrid execution', async () => {
    const planBase = {
      queryId: 'ana-terms-1',
      tenantId,
      authorizedProjects: [projectId],
      timeInterval: {
        startInclusive: '2026-10-25T09:00:00.000Z',
        endExclusive: '2026-10-25T11:00:00.000Z',
      },
      aggregations: [
        {
          name: 'terms_test',
          type: 'terms' as const,
          field: 'log.level',
          size: 5,
        },
      ],
      resourceBudget: baseBudget,
    };

    const resJsonl = await adapter.executeAggregation({ ...planBase, descriptors: [seg1Jsonl, seg2Jsonl], parquetDescriptors: [] });
    const resParquet = await adapter.executeAggregation({ ...planBase, descriptors: [], parquetDescriptors: [seg1Parquet, seg2Parquet] });
    const resHybrid = await adapter.executeAggregation({ ...planBase, descriptors: [seg2Jsonl], parquetDescriptors: [seg1Parquet] });

    const bJsonl = (resJsonl.aggregations['terms_test'] as any).buckets;
    const bParquet = (resParquet.aggregations['terms_test'] as any).buckets;
    const bHybrid = (resHybrid.aggregations['terms_test'] as any).buckets;

    assert.deepEqual(bParquet, bJsonl);
    assert.deepEqual(bHybrid, bJsonl);
  });

  it('ANA-3: Dynamic facets parity across JSONL, Parquet and Hybrid execution', async () => {
    const planBase: AuthorizedFacetsPlan = {
      queryId: 'ana-facet-1',
      tenantId,
      authorizedProjects: [projectId],
      timeInterval: {
        startInclusive: '2026-10-25T09:00:00.000Z',
        endExclusive: '2026-10-25T11:00:00.000Z',
      },
      facetFields: ['log.level', 'service.name'],
      resourceBudget: baseBudget,
      descriptors: [seg1Jsonl, seg2Jsonl],
      parquetDescriptors: [],
    };

    const resJsonl = await adapter.executeFacets({ ...planBase, descriptors: [seg1Jsonl, seg2Jsonl], parquetDescriptors: [] });
    const resParquet = await adapter.executeFacets({ ...planBase, descriptors: [], parquetDescriptors: [seg1Parquet, seg2Parquet] });
    const resHybrid = await adapter.executeFacets({ ...planBase, descriptors: [seg2Jsonl], parquetDescriptors: [seg1Parquet] });

    assert.deepEqual(resParquet.facets, resJsonl.facets);
    assert.deepEqual(resHybrid.facets, resJsonl.facets);
  });
});
