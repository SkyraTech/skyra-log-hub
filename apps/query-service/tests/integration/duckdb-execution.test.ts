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
import { FilterCompilerService } from '../../src/modules/query-execution/application/filter-compiler.service.js';
import { QueryConfigService } from '../../src/config/query-config.service.js';
import { QueryAuditService } from '../../src/modules/audit/query-audit.service.js';
import type { AuthorizedLogQueryPlan } from '../../src/modules/query-execution/domain/authorized-query-plan.model.js';
import type { TrustedArchiveSegmentDescriptor } from '../../src/modules/archive-discovery/domain/archive-segment-descriptor.model.js';
import {
  QueryTimeoutException,
  QueryCancelledException,
} from '../../src/common/errors/query.errors.js';

describe('DuckDB Real Execution & Analytical Query Tests (LOGHUB-QUERY-003)', () => {
  let tempDir: string;
  let file1Path: string;
  let file2Path: string;
  let instanceManager: DuckDbInstanceManager;
  let adapter: DuckDbLogQueryAdapter;
  let filterCompiler: FilterCompilerService;

  const tenantId = '00000000-0000-0000-0000-000000000001';
  const projectId = 'proj-core-api';

  const createEvent = (
    ts: string,
    id: string,
    level: string,
    message: string,
    extra: Record<string, unknown> = {},
  ) => ({
    '@timestamp': ts,
    'ecs.version': '8.11.0',
    event: { id, action: 'http.request', dataset: 'skyra.application' },
    log: { level },
    message,
    service: { name: 'core-api', environment: 'production', version: '1.2.0' },
    skyra: { project_id: projectId, tenant_id: tenantId, schema_version: '1.0.0' },
    ...extra,
  });

  before(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyra-duckdb-test-'));
    file1Path = path.join(tempDir, 'segment-0001.jsonl');
    file2Path = path.join(tempDir, 'segment-0002.jsonl');

    const eventsFile1 = [
      createEvent('2026-10-26T10:00:00.000Z', '00000000-0000-4000-8000-000000000001', 'info', 'Server started successfully'),
      createEvent('2026-10-26T10:15:00.000Z', '00000000-0000-4000-8000-000000000002', 'warn', 'High memory usage: 82% threshold'),
      createEvent('2026-10-26T10:30:00.000Z', '00000000-0000-4000-8000-000000000003', 'error', 'Database connection timeout on query', {
        error: { type: 'TimeoutError', message: 'Connection timed out after 5000ms' },
        http: { response: { status_code: 504 } },
      }),
      createEvent('2026-10-26T10:45:00.000Z', '00000000-0000-4000-8000-000000000004', 'info', 'Unicode log: 支付网关成功 🚀 Привет мир! 日本語テスト'),
    ];

    const eventsFile2 = [
      createEvent('2026-10-26T11:00:00.000Z', '00000000-0000-4000-8000-000000000005', 'info', 'Health check ping passed', {
        http: { response: { status_code: 200 } },
      }),
      createEvent('2026-10-26T11:15:00.000Z', '00000000-0000-4000-8000-000000000006', 'error', 'Internal server error: null pointer dereference', {
        error: { type: 'NullPointerException', message: 'User object was null' },
        http: { response: { status_code: 500 } },
      }),
      createEvent('2026-10-26T11:30:00.000Z', '00000000-0000-4000-8000-000000000007', 'debug', 'Cache hit for user profile key: usr_123', {
        user: { id: 'usr_123' },
      }),
    ];

    fs.writeFileSync(file1Path, eventsFile1.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf8');
    fs.writeFileSync(file2Path, eventsFile2.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf8');

    const config = new QueryConfigService();
    instanceManager = new DuckDbInstanceManager(config);
    await instanceManager.initialize();

    const sqlGenerator = new SqlGeneratorService();
    const governor = new QueryResourceGovernorService();
    const audit = new QueryAuditService(config);
    adapter = new DuckDbLogQueryAdapter(instanceManager, sqlGenerator, governor, audit);
    filterCompiler = new FilterCompilerService();
  });

  after(async () => {
    if (instanceManager) {
      await instanceManager.shutdown();
    }
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  const makeDescriptor = (filePath: string, id: string): TrustedArchiveSegmentDescriptor => {
    const stats = fs.statSync(filePath);
    return {
      id,
      tenantId,
      projectId,
      environment: 'production',
      serviceName: 'core-api',
      date: '2026-10-26',
      segmentFilename: path.basename(filePath),
      resolvedPath: filePath,
      recordCount: 4,
      byteSize: stats.size,
      sha256Checksum: crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex'),
      firstEventTimestamp: '2026-10-26T10:00:00.000Z',
      lastEventTimestamp: '2026-10-26T11:30:00.000Z',
      finalizedAt: '2026-10-26T11:35:00.000Z',
      verifiedAt: '2026-10-26T11:40:00.000Z',
      integrityStatus: 'VERIFIED',
    };
  };

  it('DDB-1: should scan a single JSONL segment and extract canonical events', async () => {
    const descriptor = makeDescriptor(file1Path, 'seg-1');
    const plan: AuthorizedLogQueryPlan = {
      queryId: 'q-single-1',
      tenantId,
      authorizedProjects: [projectId],
      descriptors: [descriptor],
      timeInterval: {
        startInclusive: '2026-10-26T10:00:00.000Z',
        endExclusive: '2026-10-26T11:00:00.000Z',
      },
      sort: { field: '@timestamp', direction: 'desc' },
      limit: 10,
      resourceBudget: {
        maxSegments: 500,
        maxScannedBytes: 5000000,
        maxRows: 500,
        timeoutMs: 30000,
        memoryBudgetMb: 256,
      },
    };

    const result = await adapter.execute(plan);

    assert.equal(result.events.length, 4);
    assert.equal(result.matchedCount, 4);
    assert.equal(result.scannedSegmentCount, 1);
    // Ordered descending by @timestamp
    assert.equal(result.events[0]?.['@timestamp'], '2026-10-26T10:45:00.000Z');
    assert.equal(result.events[3]?.['@timestamp'], '2026-10-26T10:00:00.000Z');
  });

  it('DDB-2: should scan multiple segments and maintain deterministic tie-breaker sorting', async () => {
    const desc1 = makeDescriptor(file1Path, 'seg-1');
    const desc2 = makeDescriptor(file2Path, 'seg-2');

    const plan: AuthorizedLogQueryPlan = {
      queryId: 'q-multi-1',
      tenantId,
      authorizedProjects: [projectId],
      descriptors: [desc1, desc2],
      timeInterval: {
        startInclusive: '2026-10-26T10:00:00.000Z',
        endExclusive: '2026-10-26T12:00:00.000Z',
      },
      sort: { field: '@timestamp', direction: 'desc' },
      limit: 10,
      resourceBudget: {
        maxSegments: 500,
        maxScannedBytes: 5000000,
        maxRows: 500,
        timeoutMs: 30000,
        memoryBudgetMb: 256,
      },
    };

    const result = await adapter.execute(plan);

    assert.equal(result.events.length, 7);
    assert.equal(result.events[0]?.['@timestamp'], '2026-10-26T11:30:00.000Z');
    assert.equal(result.events[6]?.['@timestamp'], '2026-10-26T10:00:00.000Z');
    assert.ok(result.tieBreakerApplied);
  });

  it('DDB-3: should handle zero segments gracefully with fast-path empty result', async () => {
    const plan: AuthorizedLogQueryPlan = {
      queryId: 'q-zero-1',
      tenantId,
      authorizedProjects: [projectId],
      descriptors: [],
      timeInterval: {
        startInclusive: '2026-10-26T10:00:00.000Z',
        endExclusive: '2026-10-26T12:00:00.000Z',
      },
      sort: { field: '@timestamp', direction: 'desc' },
      limit: 10,
      resourceBudget: {
        maxSegments: 500,
        maxScannedBytes: 5000000,
        maxRows: 500,
        timeoutMs: 30000,
        memoryBudgetMb: 256,
      },
    };

    const result = await adapter.execute(plan);
    assert.equal(result.events.length, 0);
    assert.equal(result.scannedSegmentCount, 0);
  });

  it('DDB-4: should extract and preserve Unicode messages accurately', async () => {
    const desc1 = makeDescriptor(file1Path, 'seg-1');
    const filter = filterCompiler.compileFilters([
      { field: 'message', operator: 'contains', value: 'Привет мир' },
    ]);

    const plan: AuthorizedLogQueryPlan = {
      queryId: 'q-unicode-1',
      tenantId,
      authorizedProjects: [projectId],
      descriptors: [desc1],
      timeInterval: {
        startInclusive: '2026-10-26T10:00:00.000Z',
        endExclusive: '2026-10-26T11:00:00.000Z',
      },
      filter,
      sort: { field: '@timestamp', direction: 'desc' },
      limit: 10,
      resourceBudget: {
        maxSegments: 500,
        maxScannedBytes: 5000000,
        maxRows: 500,
        timeoutMs: 30000,
        memoryBudgetMb: 256,
      },
    };

    const result = await adapter.execute(plan);
    assert.equal(result.events.length, 1);
    assert.ok(result.events[0]?.message.includes('支付网关成功 🚀 Привет мир! 日本語テスト'));
  });

  it('DDB-5: should filter by numeric fields and handle missing optional fields safely', async () => {
    const desc1 = makeDescriptor(file1Path, 'seg-1');
    const desc2 = makeDescriptor(file2Path, 'seg-2');

    const filter = filterCompiler.compileFilters([
      { field: 'status_code', operator: 'gte', value: 500 },
    ]);

    const plan: AuthorizedLogQueryPlan = {
      queryId: 'q-numeric-1',
      tenantId,
      authorizedProjects: [projectId],
      descriptors: [desc1, desc2],
      timeInterval: {
        startInclusive: '2026-10-26T10:00:00.000Z',
        endExclusive: '2026-10-26T12:00:00.000Z',
      },
      filter,
      sort: { field: '@timestamp', direction: 'desc' },
      limit: 10,
      resourceBudget: {
        maxSegments: 500,
        maxScannedBytes: 5000000,
        maxRows: 500,
        timeoutMs: 30000,
        memoryBudgetMb: 256,
      },
    };

    const result = await adapter.execute(plan);
    assert.equal(result.events.length, 2);
    // Both 500 and 504 are returned
    const statuses = result.events.map((e) => e.http?.response?.status_code);
    assert.ok(statuses.includes(500));
    assert.ok(statuses.includes(504));
  });

  it('DDB-6: should filter by "exists" on optional error object', async () => {
    const desc1 = makeDescriptor(file1Path, 'seg-1');
    const desc2 = makeDescriptor(file2Path, 'seg-2');

    const filter = filterCompiler.compileFilters([
      { field: 'error.type', operator: 'exists', value: true },
    ]);

    const plan: AuthorizedLogQueryPlan = {
      queryId: 'q-exists-1',
      tenantId,
      authorizedProjects: [projectId],
      descriptors: [desc1, desc2],
      timeInterval: {
        startInclusive: '2026-10-26T10:00:00.000Z',
        endExclusive: '2026-10-26T12:00:00.000Z',
      },
      filter,
      sort: { field: '@timestamp', direction: 'desc' },
      limit: 10,
      resourceBudget: {
        maxSegments: 500,
        maxScannedBytes: 5000000,
        maxRows: 500,
        timeoutMs: 30000,
        memoryBudgetMb: 256,
      },
    };

    const result = await adapter.execute(plan);
    assert.equal(result.events.length, 2);
    assert.equal(result.events[0]?.error?.type, 'NullPointerException');
    assert.equal(result.events[1]?.error?.type, 'TimeoutError');
  });

  it('DDB-7: should enforce bounded limit and set truncated flag', async () => {
    const desc1 = makeDescriptor(file1Path, 'seg-1');
    const desc2 = makeDescriptor(file2Path, 'seg-2');

    const plan: AuthorizedLogQueryPlan = {
      queryId: 'q-limit-1',
      tenantId,
      authorizedProjects: [projectId],
      descriptors: [desc1, desc2],
      timeInterval: {
        startInclusive: '2026-10-26T10:00:00.000Z',
        endExclusive: '2026-10-26T12:00:00.000Z',
      },
      sort: { field: '@timestamp', direction: 'desc' },
      limit: 3,
      resourceBudget: {
        maxSegments: 500,
        maxScannedBytes: 5000000,
        maxRows: 500,
        timeoutMs: 30000,
        memoryBudgetMb: 256,
      },
    };

    const result = await adapter.execute(plan);
    assert.equal(result.events.length, 3);
    assert.equal(result.truncated, true);
  });

  it('DDB-8: should cancel query and trigger interrupt when AbortSignal fires', async () => {
    const desc1 = makeDescriptor(file1Path, 'seg-1');
    const controller = new AbortController();

    const plan: AuthorizedLogQueryPlan = {
      queryId: 'q-cancel-1',
      tenantId,
      authorizedProjects: [projectId],
      descriptors: [desc1],
      timeInterval: {
        startInclusive: '2026-10-26T10:00:00.000Z',
        endExclusive: '2026-10-26T12:00:00.000Z',
      },
      sort: { field: '@timestamp', direction: 'desc' },
      limit: 10,
      resourceBudget: {
        maxSegments: 500,
        maxScannedBytes: 5000000,
        maxRows: 500,
        timeoutMs: 30000,
        memoryBudgetMb: 256,
      },
    };

    // Abort prior to execution
    controller.abort();

    await assert.rejects(
      async () => {
        await adapter.execute(plan, controller.signal);
      },
      (err: unknown) => {
        assert.ok(err instanceof QueryCancelledException);
        return true;
      },
    );
  });

  it('DDB-9: should enforce query timeout and throw QueryTimeoutException', async () => {
    const desc1 = makeDescriptor(file1Path, 'seg-1');

    const plan: AuthorizedLogQueryPlan = {
      queryId: 'q-timeout-1',
      tenantId,
      authorizedProjects: [projectId],
      descriptors: [desc1],
      timeInterval: {
        startInclusive: '2026-10-26T10:00:00.000Z',
        endExclusive: '2026-10-26T12:00:00.000Z',
      },
      sort: { field: '@timestamp', direction: 'desc' },
      limit: 10,
      resourceBudget: {
        maxSegments: 500,
        maxScannedBytes: 5000000,
        maxRows: 500,
        timeoutMs: 1, // 1 millisecond ceiling guarantees timeout
        memoryBudgetMb: 256,
      },
    };

    await assert.rejects(
      async () => {
        await adapter.execute(plan);
      },
      (err: unknown) => {
        assert.ok(err instanceof QueryTimeoutException || err instanceof QueryCancelledException);
        return true;
      },
    );
  });

  it('DDB-10: should execute concurrent queries safely without crosstalk', async () => {
    const desc1 = makeDescriptor(file1Path, 'seg-1');

    const makePlan = (id: string, level: string): AuthorizedLogQueryPlan => ({
      queryId: id,
      tenantId,
      authorizedProjects: [projectId],
      descriptors: [desc1],
      timeInterval: {
        startInclusive: '2026-10-26T10:00:00.000Z',
        endExclusive: '2026-10-26T12:00:00.000Z',
      },
      filter: filterCompiler.compileFilters([{ field: 'level', operator: 'eq', value: level }]),
      sort: { field: '@timestamp', direction: 'desc' },
      limit: 10,
      resourceBudget: {
        maxSegments: 500,
        maxScannedBytes: 5000000,
        maxRows: 500,
        timeoutMs: 30000,
        memoryBudgetMb: 256,
      },
    });

    const [rInfo, rWarn, rError] = await Promise.all([
      adapter.execute(makePlan('cq-1', 'info')),
      adapter.execute(makePlan('cq-2', 'warn')),
      adapter.execute(makePlan('cq-3', 'error')),
    ]);

    assert.equal(rInfo.events.length, 2);
    assert.equal(rWarn.events.length, 1);
    assert.equal(rError.events.length, 1);
  });
});
