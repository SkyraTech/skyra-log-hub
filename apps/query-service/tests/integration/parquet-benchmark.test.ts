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
import {
  type AuthorizedLogQueryPlan,
  DEFAULT_QUERY_RESOURCE_BUDGET,
} from '../../src/modules/query-execution/domain/authorized-query-plan.model.js';
import type { AuthorizedAggregationPlan } from '../../src/modules/analytics/domain/aggregation.model.js';
import type { TrustedArchiveSegmentDescriptor } from '../../src/modules/archive-discovery/domain/archive-segment-descriptor.model.js';
import type { TrustedParquetSegmentDescriptor } from '../../src/modules/parquet-cache/domain/parquet-segment.model.js';

describe('Parquet Performance & Compression Benchmark (LOGHUB-QUERY-006)', () => {
  let tempArchiveRoot: string;
  let tempCacheRoot: string;
  let instanceManager: DuckDbInstanceManager;
  let adapter: DuckDbLogQueryAdapter;

  const tenantId = '00000000-0000-4000-8000-000000000001';
  const projectId = 'proj-benchmark';
  const environment = 'production';
  const serviceName = 'bench-svc';
  const date = '2026-10-25';

  const TOTAL_EVENTS = 5000;
  const SEGMENTS_COUNT = 2;
  const EVENTS_PER_SEGMENT = TOTAL_EVENTS / SEGMENTS_COUNT;

  const jsonlDescriptors: TrustedArchiveSegmentDescriptor[] = [];
  const parquetDescriptors: TrustedParquetSegmentDescriptor[] = [];

  let totalJsonlBytes = 0;
  let totalParquetBytes = 0;
  let totalConversionMs = 0;

  before(async () => {
    tempArchiveRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skyra-bench-arch-'));
    tempCacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skyra-bench-cache-'));

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

    const levels = ['info', 'warn', 'error', 'debug'];
    const actions = ['http.request', 'db.query', 'auth.login', 'queue.process'];

    for (let s = 0; s < SEGMENTS_COUNT; s++) {
      const segId = `bench-seg-${s + 1}`;
      const events = [];
      const baseMs = new Date('2026-10-25T10:00:00.000Z').getTime() + s * 3600000;

      for (let i = 0; i < EVENTS_PER_SEGMENT; i++) {
        const ts = new Date(baseMs + i * 1000).toISOString();
        const level = levels[i % levels.length];
        const action = actions[i % actions.length];
        events.push({
          '@timestamp': ts,
          'ecs.version': '8.11.0',
          event: { id: `bench-evt-${s}-${i}`, action },
          log: { level },
          message: `Benchmark event ${i} executed action ${action} with status code ${200 + (i % 5)}`,
          service: { name: serviceName, environment },
          skyra: { project_id: projectId, tenant_id: tenantId, schema_version: '1.0.0' },
          http: { response: { status_code: 200 + (i % 5) } },
        });
      }

      const filename = `${segId}.jsonl`;
      const filePath = path.join(segDir, filename);
      const raw = events.map((e) => JSON.stringify(e)).join('\n') + '\n';
      fs.writeFileSync(filePath, raw, 'utf8');
      const sizeBytes = Buffer.byteLength(raw, 'utf8');
      totalJsonlBytes += sizeBytes;

      const desc: TrustedArchiveSegmentDescriptor = {
        id: segId,
        tenantId,
        projectId,
        environment,
        serviceName,
        date,
        segmentFilename: filename,
        resolvedPath: filePath,
        byteSize: sizeBytes,
        recordCount: EVENTS_PER_SEGMENT,
        sha256Checksum: crypto.createHash('sha256').update(raw).digest('hex'),
        firstEventTimestamp: new Date(baseMs).toISOString(),
        lastEventTimestamp: new Date(baseMs + EVENTS_PER_SEGMENT * 1000).toISOString(),
        finalizedAt: new Date().toISOString(),
        verifiedAt: new Date().toISOString(),
        integrityStatus: 'VERIFIED',
      };
      jsonlDescriptors.push(desc);

      // Materialize
      const convStart = performance.now();
      const mat = await materializeUseCase.execute(desc);
      totalConversionMs += performance.now() - convStart;

      parquetDescriptors.push(mat.parquetDescriptor!);
      totalParquetBytes += mat.outputBytes;
    }
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

  it('BENCH-1: Storage Compression Ratio Measurement', () => {
    const compressionRatio = ((1 - totalParquetBytes / totalJsonlBytes) * 100).toFixed(1);
    // eslint-disable-next-line no-console
    console.log(
      `\n[BENCHMARK] Storage Compression for ${TOTAL_EVENTS} events:` +
      `\n  - Canonical JSONL: ${(totalJsonlBytes / 1024 / 1024).toFixed(2)} MB` +
      `\n  - Derived Parquet (zstd): ${(totalParquetBytes / 1024 / 1024).toFixed(2)} MB` +
      `\n  - Space Saved: ${compressionRatio}%` +
      `\n  - Conversion Time: ${totalConversionMs.toFixed(1)} ms\n`
    );
    assert.ok(totalParquetBytes < totalJsonlBytes, 'Parquet zstd must achieve positive compression over raw JSONL');
  });

  it('BENCH-2: Query Latency Benchmark (Search & Analytical Aggregations)', async () => {
    const timeInterval = {
      startInclusive: '2026-10-25T09:00:00.000Z',
      endExclusive: '2026-10-25T13:00:00.000Z',
    };

    // 1. Search Query Benchmark
    const searchPlanBase = {
      queryId: 'bench-search',
      tenantId,
      authorizedProjects: [projectId],
      timeInterval,
      sort: { field: '@timestamp', direction: 'desc' as const },
      limit: 50,
      resourceBudget: DEFAULT_QUERY_RESOURCE_BUDGET,
    };

    const runTimings = async (fn: () => Promise<void>, runs = 3) => {
      const times: number[] = [];
      for (let i = 0; i < runs; i++) {
        const start = performance.now();
        await fn();
        times.push(performance.now() - start);
      }
      times.sort((a, b) => a - b);
      return times[Math.floor(times.length / 2)] ?? 0;
    };

    const jsonlSearchMed = await runTimings(async () => {
      await adapter.execute({ ...searchPlanBase, descriptors: jsonlDescriptors, parquetDescriptors: [] });
    });
    const parquetSearchMed = await runTimings(async () => {
      await adapter.execute({ ...searchPlanBase, descriptors: [], parquetDescriptors: parquetDescriptors });
    });
    const hybridSearchMed = await runTimings(async () => {
      await adapter.execute({
        ...searchPlanBase,
        descriptors: [jsonlDescriptors[0]!],
        parquetDescriptors: [parquetDescriptors[1]!],
      });
    });

    // 2. Terms Aggregation Benchmark
    const termsPlanBase: AuthorizedAggregationPlan = {
      queryId: 'bench-terms',
      tenantId,
      authorizedProjects: [projectId],
      timeInterval,
      aggregations: [
        {
          name: 'level_terms',
          type: 'terms' as const,
          field: 'log.level',
          size: 5,
        },
      ],
      resourceBudget: {
        maxSegments: 100,
        maxScannedBytes: 50_000_000,
        timeoutMs: 30000,
      },
      descriptors: [],
      parquetDescriptors: [],
    };

    const jsonlTermsMed = await runTimings(async () => {
      await adapter.executeAggregation({ ...termsPlanBase, descriptors: jsonlDescriptors, parquetDescriptors: [] });
    });
    const parquetTermsMed = await runTimings(async () => {
      await adapter.executeAggregation({ ...termsPlanBase, descriptors: [], parquetDescriptors: parquetDescriptors });
    });

    // eslint-disable-next-line no-console
    console.log(
      `[BENCHMARK] Query Latency Summary (Median of 3 runs):` +
      `\n  Search Query (limit 50):` +
      `\n    - JSONL Scan:   ${jsonlSearchMed.toFixed(2)} ms` +
      `\n    - Parquet Scan: ${parquetSearchMed.toFixed(2)} ms` +
      `\n    - Hybrid Scan:  ${hybridSearchMed.toFixed(2)} ms` +
      `\n  Terms Aggregation (log.level):` +
      `\n    - JSONL Scan:   ${jsonlTermsMed.toFixed(2)} ms` +
      `\n    - Parquet Scan: ${parquetTermsMed.toFixed(2)} ms\n`
    );

    assert.ok(jsonlSearchMed > 0);
    assert.ok(parquetSearchMed > 0);
  });
});
