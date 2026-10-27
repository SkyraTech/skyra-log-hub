import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { DuckDbInstanceManager } from '../../src/modules/query-execution/infrastructure/duckdb/duckdb-instance.manager.js';
import { SqlGeneratorService } from '../../src/modules/query-execution/application/sql-generator.service.js';
import { QueryResourceGovernorService } from '../../src/modules/query-execution/infrastructure/duckdb/query-resource-governor.service.js';
import { DuckDbLogQueryAdapter } from '../../src/modules/query-execution/infrastructure/duckdb/duckdb-query-adapter.js';
import { QueryConfigService } from '../../src/config/query-config.service.js';
import { QueryAuditService } from '../../src/modules/audit/query-audit.service.js';
import { ParquetPathSafetyService } from '../../src/modules/parquet-cache/infrastructure/filesystem/parquet-path-safety.service.js';
import { DuckDbParquetConverter } from '../../src/modules/parquet-cache/infrastructure/duckdb/duckdb-parquet-converter.js';
import { FileParquetCatalogService } from '../../src/modules/parquet-cache/infrastructure/catalog/file-parquet-catalog.service.js';
import { MaterializeSegmentUseCase } from '../../src/modules/parquet-cache/application/materialize-segment.use-case.js';
import {
  type AuthorizedLogQueryPlan,
  DEFAULT_QUERY_RESOURCE_BUDGET,
} from '../../src/modules/query-execution/domain/authorized-query-plan.model.js';
import { resolveCanonicalField } from '../../src/modules/query-execution/domain/canonical-field.model.js';
import type { TrustedArchiveSegmentDescriptor } from '../../src/modules/archive-discovery/domain/archive-segment-descriptor.model.js';
import type { TrustedParquetSegmentDescriptor } from '../../src/modules/parquet-cache/domain/parquet-segment.model.js';

describe('Hybrid Query & Search Semantic Parity Tests (LOGHUB-QUERY-006)', () => {
  let tempArchiveRoot: string;
  let tempCacheRoot: string;
  let instanceManager: DuckDbInstanceManager;
  let adapter: DuckDbLogQueryAdapter;

  const tenantId = '00000000-0000-4000-8000-000000000001';
  const projectId = 'proj-hybrid-core';
  const environment = 'production';
  const serviceName = 'core-api';
  const date = '2026-10-25';

  let seg1Jsonl: TrustedArchiveSegmentDescriptor;
  let seg2Jsonl: TrustedArchiveSegmentDescriptor;
  let seg1Parquet: TrustedParquetSegmentDescriptor;
  let seg2Parquet: TrustedParquetSegmentDescriptor;

  const createEvent = (ts: string, id: string, level: string, message: string, extra = {}) => ({
    '@timestamp': ts,
    'ecs.version': '8.11.0',
    event: { id, action: 'log.entry' },
    log: { level },
    message,
    service: { name: serviceName, environment },
    skyra: { project_id: projectId, tenant_id: tenantId, schema_version: '1.0.0' },
    ...extra,
  });

  before(async () => {
    tempArchiveRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skyra-hybrid-archive-'));
    tempCacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skyra-hybrid-cache-'));

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
    const governor = new QueryResourceGovernorService();
    const audit = new QueryAuditService(config);
    const pathSafety = new ParquetPathSafetyService(config);
    const catalog = new FileParquetCatalogService(pathSafety, config, audit);
    const converter = new DuckDbParquetConverter(instanceManager, pathSafety);
    const materializeUseCase = new MaterializeSegmentUseCase(catalog, converter, audit, config);

    adapter = new DuckDbLogQueryAdapter(instanceManager, sqlGen, governor, audit);

    // Prepare 2 JSONL segments
    const seg1Dir = path.join(tempArchiveRoot, tenantId, projectId, environment, date);
    fs.mkdirSync(seg1Dir, { recursive: true });

    const seg1Events = [
      createEvent('2026-10-25T10:00:00.000Z', 'evt-001', 'info', 'Server bootstrap complete'),
      createEvent('2026-10-25T10:05:00.000Z', 'evt-002', 'warn', 'Memory pressure warning'),
      createEvent('2026-10-25T10:10:00.000Z', 'evt-003', 'error', 'Database connection refused', {
        error: { type: 'ConnectionRefused' },
      }),
    ];

    const seg2Events = [
      createEvent('2026-10-25T10:15:00.000Z', 'evt-004', 'info', 'Cache refreshed'),
      createEvent('2026-10-25T10:20:00.000Z', 'evt-005', 'error', 'Payment gateway failed', {
        error: { type: 'GatewayTimeout' },
      }),
      createEvent('2026-10-25T10:25:00.000Z', 'evt-006', 'debug', 'Trace finished'),
    ];

    const seg1Path = path.join(seg1Dir, 'segment-0001.jsonl');
    const seg2Path = path.join(seg1Dir, 'segment-0002.jsonl');

    const seg1Raw = seg1Events.map((e) => JSON.stringify(e)).join('\n') + '\n';
    const seg2Raw = seg2Events.map((e) => JSON.stringify(e)).join('\n') + '\n';

    fs.writeFileSync(seg1Path, seg1Raw, 'utf8');
    fs.writeFileSync(seg2Path, seg2Raw, 'utf8');

    seg1Jsonl = {
      id: 'seg-1',
      tenantId,
      projectId,
      environment,
      serviceName,
      date,
      segmentFilename: 'segment-0001.jsonl',
      resolvedPath: seg1Path,
      byteSize: Buffer.byteLength(seg1Raw, 'utf8'),
      recordCount: 3,
      sha256Checksum: crypto.createHash('sha256').update(seg1Raw, 'utf8').digest('hex'),
      firstEventTimestamp: '2026-10-25T10:00:00Z',
      lastEventTimestamp: '2026-10-25T10:10:00Z',
      finalizedAt: '2026-10-25T10:15:00Z',
      verifiedAt: '2026-10-25T10:15:00Z',
      integrityStatus: 'VERIFIED',
    };

    seg2Jsonl = {
      id: 'seg-2',
      tenantId,
      projectId,
      environment,
      serviceName,
      date,
      segmentFilename: 'segment-0002.jsonl',
      resolvedPath: seg2Path,
      byteSize: Buffer.byteLength(seg2Raw, 'utf8'),
      recordCount: 3,
      sha256Checksum: crypto.createHash('sha256').update(seg2Raw, 'utf8').digest('hex'),
      firstEventTimestamp: '2026-10-25T10:15:00Z',
      lastEventTimestamp: '2026-10-25T10:25:00Z',
      finalizedAt: '2026-10-25T10:30:00Z',
      verifiedAt: '2026-10-25T10:30:00Z',
      integrityStatus: 'VERIFIED',
    };

    // Materialize both segments to Parquet
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

  it('HYB-1: JSONL-only vs Parquet-only vs Hybrid execution should yield identical search results', async () => {
    const basePlan = {
      queryId: 'q-parity-1',
      tenantId,
      authorizedProjects: [projectId],
      timeInterval: {
        startInclusive: '2026-10-25T09:00:00.000Z',
        endExclusive: '2026-10-25T11:00:00.000Z',
      },
      sort: { field: '@timestamp', direction: 'asc' as const },
      limit: 10,
      resourceBudget: DEFAULT_QUERY_RESOURCE_BUDGET,
    };

    // 1. JSONL-only (both segments from JSONL)
    const jsonlPlan: AuthorizedLogQueryPlan = {
      ...basePlan,
      descriptors: [seg1Jsonl, seg2Jsonl],
      parquetDescriptors: [],
    };
    const jsonlRes = await adapter.execute(jsonlPlan);

    // 2. Parquet-only (both segments from Parquet)
    const parquetPlan: AuthorizedLogQueryPlan = {
      ...basePlan,
      descriptors: [],
      parquetDescriptors: [seg1Parquet, seg2Parquet],
    };
    const parquetRes = await adapter.execute(parquetPlan);

    // 3. Hybrid (seg1 from Parquet, seg2 from JSONL)
    const hybridPlan: AuthorizedLogQueryPlan = {
      ...basePlan,
      descriptors: [seg2Jsonl],
      parquetDescriptors: [seg1Parquet],
    };
    const hybridRes = await adapter.execute(hybridPlan);

    // Verify row counts
    assert.equal(jsonlRes.events.length, 6);
    assert.equal(parquetRes.events.length, 6);
    assert.equal(hybridRes.events.length, 6);

    // Verify event ID ordering across all 3
    const jsonlIds = jsonlRes.events.map((r) => r.event.id);
    const parquetIds = parquetRes.events.map((r) => r.event.id);
    const hybridIds = hybridRes.events.map((r) => r.event.id);

    assert.deepEqual(parquetIds, jsonlIds);
    assert.deepEqual(hybridIds, jsonlIds);

    // Verify field content parity
    for (let i = 0; i < 6; i++) {
      assert.equal(parquetRes.events[i]!.message, jsonlRes.events[i]!.message);
      assert.equal(hybridRes.events[i]!.message, jsonlRes.events[i]!.message);
      assert.equal(parquetRes.events[i]!.log.level, jsonlRes.events[i]!.log.level);
      assert.equal(hybridRes.events[i]!.log.level, jsonlRes.events[i]!.log.level);
    }
  });

  it('HYB-2: Filter parity across JSONL, Parquet and Hybrid execution', async () => {
    const fieldDef = resolveCanonicalField('log.level')!;
    const basePlan = {
      queryId: 'q-filter-parity',
      tenantId,
      authorizedProjects: [projectId],
      timeInterval: {
        startInclusive: '2026-10-25T09:00:00.000Z',
        endExclusive: '2026-10-25T11:00:00.000Z',
      },
      filter: {
        kind: 'binary' as const,
        field: fieldDef,
        operator: 'eq' as const,
        value: 'error',
      },
      sort: { field: '@timestamp', direction: 'asc' as const },
      limit: 10,
      resourceBudget: DEFAULT_QUERY_RESOURCE_BUDGET,
    };

    const jsonlRes = await adapter.execute({ ...basePlan, descriptors: [seg1Jsonl, seg2Jsonl], parquetDescriptors: [] });
    const parquetRes = await adapter.execute({ ...basePlan, descriptors: [], parquetDescriptors: [seg1Parquet, seg2Parquet] });
    const hybridRes = await adapter.execute({ ...basePlan, descriptors: [seg2Jsonl], parquetDescriptors: [seg1Parquet] });

    assert.equal(jsonlRes.events.length, 2);
    assert.equal(parquetRes.events.length, 2);
    assert.equal(hybridRes.events.length, 2);

    assert.equal(jsonlRes.events[0]!.event.id, 'evt-003');
    assert.equal(jsonlRes.events[1]!.event.id, 'evt-005');
    assert.equal(parquetRes.events[0]!.event.id, 'evt-003');
    assert.equal(parquetRes.events[1]!.event.id, 'evt-005');
    assert.equal(hybridRes.events[0]!.event.id, 'evt-003');
    assert.equal(hybridRes.events[1]!.event.id, 'evt-005');
  });

  it('HYB-3: Keyset cursor pagination continuation across source substitution (JSONL -> Parquet)', async () => {
    // Request page 1 with limit 2 using JSONL-only
    const page1Plan: AuthorizedLogQueryPlan = {
      queryId: 'q-page-1',
      tenantId,
      authorizedProjects: [projectId],
      timeInterval: {
        startInclusive: '2026-10-25T09:00:00.000Z',
        endExclusive: '2026-10-25T11:00:00.000Z',
      },
      sort: { field: '@timestamp', direction: 'asc' },
      limit: 2,
      resourceBudget: DEFAULT_QUERY_RESOURCE_BUDGET,
      descriptors: [seg1Jsonl, seg2Jsonl],
      parquetDescriptors: [],
    };

    const page1Res = await adapter.execute(page1Plan);
    assert.equal(page1Res.events.length, 2);
    assert.equal(page1Res.hasMore, true);
    assert.equal(page1Res.events[0]!.event.id, 'evt-001');
    assert.equal(page1Res.events[1]!.event.id, 'evt-002');
    assert.ok(page1Res.lastPosition);

    // Now request page 2 with limit 2, but substitute the physical source to PARQUET!
    const page2Plan: AuthorizedLogQueryPlan = {
      queryId: 'q-page-2',
      tenantId,
      authorizedProjects: [projectId],
      timeInterval: {
        startInclusive: '2026-10-25T09:00:00.000Z',
        endExclusive: '2026-10-25T11:00:00.000Z',
      },
      sort: { field: '@timestamp', direction: 'asc' },
      limit: 2,
      resourceBudget: DEFAULT_QUERY_RESOURCE_BUDGET,
      cursorPosition: page1Res.lastPosition,
      descriptors: [],
      parquetDescriptors: [seg1Parquet, seg2Parquet],
    };

    const page2Res = await adapter.execute(page2Plan);

    // Verify page 2 continues seamlessly with exact next records: evt-003 and evt-004
    assert.equal(page2Res.events.length, 2);
    assert.equal(page2Res.events[0]!.event.id, 'evt-003');
    assert.equal(page2Res.events[1]!.event.id, 'evt-004');
  });
});
