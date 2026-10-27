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
import { CursorCodecService } from '../../src/modules/search/application/cursor-codec.service.js';
import {
  type AuthorizedLogQueryPlan,
  DEFAULT_QUERY_RESOURCE_BUDGET,
} from '../../src/modules/query-execution/domain/authorized-query-plan.model.js';
import type { TrustedArchiveSegmentDescriptor } from '../../src/modules/archive-discovery/domain/archive-segment-descriptor.model.js';
import type { TrustedParquetSegmentDescriptor } from '../../src/modules/parquet-cache/domain/parquet-segment.model.js';

describe('Stable Physical Event Identity & Duplicate Pagination Verification (LOGHUB-QUERY-007)', () => {
  let tempArchiveRoot: string;
  let tempCacheRoot: string;
  let instanceManager: DuckDbInstanceManager;
  let adapter: DuckDbLogQueryAdapter;
  let cursorCodec: CursorCodecService;
  let materializeUseCase: MaterializeSegmentUseCase;

  const tenantId = '00000000-0000-4000-8000-000000000001';
  const projectId = 'proj-dup-test';
  const environment = 'production';
  const serviceName = 'dup-svc';
  const date = '2026-10-27';

  let jsonlDescriptor: TrustedArchiveSegmentDescriptor;
  let parquetDescriptor: TrustedParquetSegmentDescriptor;

  const DUPLICATE_ROWS_COUNT = 25;
  const canonicalEvents: any[] = [];

  before(async () => {
    tempArchiveRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skyra-dup-arch-'));
    tempCacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skyra-dup-cache-'));

    const config = new QueryConfigService({
      nodeEnv: 'test',
      archiveRoot: tempArchiveRoot,
      parquetCacheRoot: tempCacheRoot,
      parquetCacheEnabled: true,
      parquetMaterializationEnabled: true,
      cursorSigningSecret: 'insecure-test-secret-key-at-least-32-chars-long-for-tests',
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
    materializeUseCase = new MaterializeSegmentUseCase(catalog, converter, audit, config);
    cursorCodec = new CursorCodecService(config, audit);

    adapter = new DuckDbLogQueryAdapter(instanceManager, sqlGen, governor, audit, anaSqlGen);

    const segDir = path.join(tempArchiveRoot, tenantId, projectId, environment, date);
    fs.mkdirSync(segDir, { recursive: true });

    // Generate intentionally duplicated rows:
    // 10 byte-identical rows (identical timestamp, identical event.id, identical message)
    // 10 identical timestamp rows with distinct event IDs
    // 5 standard sequential rows
    const sharedTimestamp = '2026-10-27T10:00:00.000Z';
    const sharedEventId = 'evt-byte-identical';

    for (let i = 0; i < 10; i++) {
      canonicalEvents.push({
        '@timestamp': sharedTimestamp,
        'ecs.version': '8.11.0',
        event: { id: sharedEventId, action: 'duplicate.byte' },
        log: { level: 'warn' },
        message: 'Byte-identical payload with exact same content',
        service: { name: serviceName, environment },
        skyra: { project_id: projectId, tenant_id: tenantId, schema_version: '1.0.0' },
      });
    }

    for (let i = 0; i < 10; i++) {
      canonicalEvents.push({
        '@timestamp': sharedTimestamp,
        'ecs.version': '8.11.0',
        event: { id: `evt-same-ts-${i}`, action: 'duplicate.timestamp' },
        log: { level: 'info' },
        message: `Identical timestamp with unique ID ${i}`,
        service: { name: serviceName, environment },
        skyra: { project_id: projectId, tenant_id: tenantId, schema_version: '1.0.0' },
      });
    }

    for (let i = 0; i < 5; i++) {
      canonicalEvents.push({
        '@timestamp': new Date(new Date(sharedTimestamp).getTime() + (i + 1) * 1000).toISOString(),
        'ecs.version': '8.11.0',
        event: { id: `evt-seq-${i}`, action: 'sequential' },
        log: { level: 'info' },
        message: `Sequential event ${i}`,
        service: { name: serviceName, environment },
        skyra: { project_id: projectId, tenant_id: tenantId, schema_version: '1.0.0' },
      });
    }

    const filename = 'dup-segment-0001.jsonl';
    const filePath = path.join(segDir, filename);
    const raw = canonicalEvents.map((e) => JSON.stringify(e)).join('\n') + '\n';
    fs.writeFileSync(filePath, raw, 'utf8');
    const sizeBytes = Buffer.byteLength(raw, 'utf8');

    jsonlDescriptor = {
      id: 'dup-seg-1',
      tenantId,
      projectId,
      environment,
      serviceName,
      date,
      segmentFilename: filename,
      resolvedPath: filePath,
      byteSize: sizeBytes,
      recordCount: DUPLICATE_ROWS_COUNT,
      sha256Checksum: crypto.createHash('sha256').update(raw).digest('hex'),
      firstEventTimestamp: sharedTimestamp,
      lastEventTimestamp: canonicalEvents[canonicalEvents.length - 1]['@timestamp'],
      finalizedAt: new Date().toISOString(),
      verifiedAt: new Date().toISOString(),
      integrityStatus: 'VERIFIED',
    };

    const mat = await materializeUseCase.execute(jsonlDescriptor);
    assert.equal(mat.success, true);
    parquetDescriptor = mat.parquetDescriptor!;
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

  it('P0-D1: Exhaustive pagination over JSONL with byte-identical duplicates (Ascending sort)', async () => {
    const timeInterval = {
      startInclusive: '2026-10-27T00:00:00.000Z',
      endExclusive: '2026-10-27T23:59:59.000Z',
    };

    const pageSize = 7;
    let cursorPosition = undefined;
    const collectedEvents: any[] = [];
    let pageCount = 0;

    while (true) {
      pageCount++;
      const plan: AuthorizedLogQueryPlan = {
        queryId: `test-dup-asc-${pageCount}`,
        tenantId,
        authorizedProjects: [projectId],
        timeInterval,
        sort: { field: '@timestamp', direction: 'asc' },
        limit: pageSize,
        fetchExtraRow: true,
        cursorPosition,
        descriptors: [jsonlDescriptor],
        parquetDescriptors: [],
        resourceBudget: DEFAULT_QUERY_RESOURCE_BUDGET,
      };

      const result = await adapter.execute(plan);
      collectedEvents.push(...result.events);

      if (!result.hasMore || !result.lastPosition) {
        break;
      }
      cursorPosition = result.lastPosition;
    }

    assert.equal(
      collectedEvents.length,
      DUPLICATE_ROWS_COUNT,
      `Exhaustive pagination must retrieve all ${DUPLICATE_ROWS_COUNT} events without skipping or dropping`,
    );

    // Verify 10 byte-identical rows were all retrieved
    const byteIdenticalCount = collectedEvents.filter((e) => e.event.id === 'evt-byte-identical').length;
    assert.equal(byteIdenticalCount, 10, 'All 10 byte-identical records must be paginated without loss');
  });

  it('P0-D2: Exhaustive pagination over Parquet with byte-identical duplicates (Descending sort)', async () => {
    const timeInterval = {
      startInclusive: '2026-10-27T00:00:00.000Z',
      endExclusive: '2026-10-27T23:59:59.000Z',
    };

    const pageSize = 6;
    let cursorPosition = undefined;
    const collectedEvents: any[] = [];
    let pageCount = 0;

    while (true) {
      pageCount++;
      const plan: AuthorizedLogQueryPlan = {
        queryId: `test-dup-desc-${pageCount}`,
        tenantId,
        authorizedProjects: [projectId],
        timeInterval,
        sort: { field: '@timestamp', direction: 'desc' },
        limit: pageSize,
        fetchExtraRow: true,
        cursorPosition,
        descriptors: [],
        parquetDescriptors: [parquetDescriptor],
        resourceBudget: DEFAULT_QUERY_RESOURCE_BUDGET,
      };

      const result = await adapter.execute(plan);
      collectedEvents.push(...result.events);

      if (!result.hasMore || !result.lastPosition) {
        break;
      }
      cursorPosition = result.lastPosition;
    }

    assert.equal(
      collectedEvents.length,
      DUPLICATE_ROWS_COUNT,
      `Exhaustive Parquet pagination must retrieve all ${DUPLICATE_ROWS_COUNT} events`,
    );

    const byteIdenticalCount = collectedEvents.filter((e) => e.event.id === 'evt-byte-identical').length;
    assert.equal(byteIdenticalCount, 10, 'All 10 byte-identical records must be present in Parquet results');
  });

  it('P0-D3: Cursor continuation across source transition (Page 1 from JSONL -> Page 2 from Parquet)', async () => {
    const timeInterval = {
      startInclusive: '2026-10-27T00:00:00.000Z',
      endExclusive: '2026-10-27T23:59:59.000Z',
    };

    // Page 1: Query JSONL directly (limit 12)
    const page1Plan: AuthorizedLogQueryPlan = {
      queryId: 'test-trans-1',
      tenantId,
      authorizedProjects: [projectId],
      timeInterval,
      sort: { field: '@timestamp', direction: 'asc' },
      limit: 12,
      fetchExtraRow: true,
      descriptors: [jsonlDescriptor],
      parquetDescriptors: [],
      resourceBudget: DEFAULT_QUERY_RESOURCE_BUDGET,
    };

    const res1 = await adapter.execute(page1Plan);
    assert.equal(res1.events.length, 12);
    assert.equal(res1.hasMore, true);
    assert.ok(res1.lastPosition);

    // Page 2: Continuation query hitting Parquet cache with Page 1's position tuple
    const page2Plan: AuthorizedLogQueryPlan = {
      queryId: 'test-trans-2',
      tenantId,
      authorizedProjects: [projectId],
      timeInterval,
      sort: { field: '@timestamp', direction: 'asc' },
      limit: 20,
      fetchExtraRow: true,
      cursorPosition: res1.lastPosition,
      descriptors: [],
      parquetDescriptors: [parquetDescriptor],
      resourceBudget: DEFAULT_QUERY_RESOURCE_BUDGET,
    };

    const res2 = await adapter.execute(page2Plan);
    // Total events: 25. Page 1 took 12, Page 2 must return remaining 13!
    assert.equal(res2.events.length, 13);
    assert.equal(res2.hasMore, false);

    // Verify union equals exact 25 canonical events
    const combined = [...res1.events, ...res2.events];
    assert.equal(combined.length, 25);
  });
});
