import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { SqlGeneratorService } from '../../../src/modules/query-execution/application/sql-generator.service.js';
import { FilterCompilerService } from '../../../src/modules/query-execution/application/filter-compiler.service.js';
import type { AuthorizedLogQueryPlan } from '../../../src/modules/query-execution/domain/authorized-query-plan.model.js';
import type { TrustedArchiveSegmentDescriptor } from '../../../src/modules/archive-discovery/domain/archive-segment-descriptor.model.js';

describe('SqlGeneratorService Unit Tests (LOGHUB-QUERY-003)', () => {
  const sqlGenerator = new SqlGeneratorService();
  const filterCompiler = new FilterCompilerService();

  const mockDescriptor: TrustedArchiveSegmentDescriptor = {
    id: 'seg-1',
    tenantId: 'tenant-100',
    projectId: 'proj-alpha',
    environment: 'production',
    serviceName: 'order-api',
    date: '2026-10-26',
    segmentFilename: 'segment-0000.jsonl',
    resolvedPath: 'C:\\data\\archive\\tenant-100\\proj-alpha\\production\\order-api\\2026-10-26\\segment-0000.jsonl',
    recordCount: 100,
    byteSize: 10240,
    sha256Checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    firstEventTimestamp: '2026-10-26T00:00:00.000Z',
    lastEventTimestamp: '2026-10-26T01:00:00.000Z',
    finalizedAt: '2026-10-26T01:05:00.000Z',
    verifiedAt: '2026-10-26T02:00:00.000Z',
    integrityStatus: 'VERIFIED',
  };

  it('SGS-1: should generate parameterized query with bound file paths and limits', () => {
    const plan: AuthorizedLogQueryPlan = {
      queryId: 'test-q-1',
      tenantId: 'tenant-100',
      authorizedProjects: ['proj-alpha'],
      descriptors: [mockDescriptor],
      timeInterval: {
        startInclusive: '2026-10-26T00:00:00.000Z',
        endExclusive: '2026-10-26T02:00:00.000Z',
      },
      sort: { field: '@timestamp', direction: 'desc' },
      limit: 25,
      resourceBudget: {
        maxSegments: 500,
        maxScannedBytes: 500000,
        maxRows: 500,
        timeoutMs: 30000,
        memoryBudgetMb: 256,
      },
    };

    const generated = sqlGenerator.generate(plan);

    assert.ok(generated.sql.includes('read_ndjson_objects([$1], filename=true)'));
    assert.ok(generated.sql.includes('ORDER BY "@timestamp" DESC, "event.id" DESC, "segment_id" DESC, "record_offset" DESC'));
    assert.equal(generated.parameters.length, 6);
    // Normalized path
    assert.equal(generated.parameters[0], 'C:/data/archive/tenant-100/proj-alpha/production/order-api/2026-10-26/segment-0000.jsonl');
    assert.equal(generated.parameters[1], 'tenant-100'); // tenant isolation
    assert.equal(generated.parameters[2], 'proj-alpha'); // project isolation
    assert.equal(generated.parameters[3], '2026-10-26T00:00:00.000Z'); // startInclusive
    assert.equal(generated.parameters[4], '2026-10-26T02:00:00.000Z'); // endExclusive
    assert.equal(generated.parameters[5], 25n); // limit
  });

  it('SGS-2: should handle multiple authorized projects with IN parameterization', () => {
    const plan: AuthorizedLogQueryPlan = {
      queryId: 'test-q-2',
      tenantId: 'tenant-100',
      authorizedProjects: ['proj-alpha', 'proj-beta'],
      descriptors: [mockDescriptor],
      timeInterval: {
        startInclusive: '2026-10-26T00:00:00.000Z',
        endExclusive: '2026-10-26T02:00:00.000Z',
      },
      sort: { field: '@timestamp', direction: 'asc' },
      limit: 50,
      resourceBudget: {
        maxSegments: 500,
        maxScannedBytes: 500000,
        maxRows: 500,
        timeoutMs: 30000,
        memoryBudgetMb: 256,
      },
    };

    const generated = sqlGenerator.generate(plan);
    assert.ok(generated.sql.includes("json_extract_string(json, '$.skyra.project_id') IN ($3, $4)"));
    assert.ok(generated.sql.includes('ASC'));
  });

  it('SGS-3: should bind filter predicates with parameterized values', () => {
    const filter = filterCompiler.compileFilters([
      { field: 'level', operator: 'eq', value: 'error' },
      { field: 'message', operator: 'contains', value: 'connection refused' },
      { field: 'status_code', operator: 'gte', value: 500 },
    ]);

    const plan: AuthorizedLogQueryPlan = {
      queryId: 'test-q-3',
      tenantId: 'tenant-100',
      authorizedProjects: ['proj-alpha'],
      descriptors: [mockDescriptor],
      timeInterval: {
        startInclusive: '2026-10-26T00:00:00.000Z',
        endExclusive: '2026-10-26T02:00:00.000Z',
      },
      filter,
      sort: { field: '@timestamp', direction: 'desc' },
      limit: 10,
      resourceBudget: {
        maxSegments: 500,
        maxScannedBytes: 500000,
        maxRows: 500,
        timeoutMs: 30000,
        memoryBudgetMb: 256,
      },
    };

    const generated = sqlGenerator.generate(plan);

    assert.ok(generated.sql.includes("json_extract_string(json, '$.log.level') = $6"));
    assert.ok(generated.sql.includes("contains(lower(json_extract_string(json, '$.message')), lower($7))"));
    assert.ok(generated.sql.includes("TRY_CAST(json_extract_string(json, '$.http.response.status_code') AS BIGINT) >= $8"));
    assert.equal(generated.parameters[5], 'error');
    assert.equal(generated.parameters[6], 'connection refused');
    assert.equal(generated.parameters[7], 500n);
  });

  it('SGS-4: should handle empty descriptors gracefully without SQL errors', () => {
    const plan: AuthorizedLogQueryPlan = {
      queryId: 'test-q-empty',
      tenantId: 'tenant-100',
      authorizedProjects: ['proj-alpha'],
      descriptors: [],
      timeInterval: {
        startInclusive: '2026-10-26T00:00:00.000Z',
        endExclusive: '2026-10-26T02:00:00.000Z',
      },
      sort: { field: '@timestamp', direction: 'desc' },
      limit: 10,
      resourceBudget: {
        maxSegments: 500,
        maxScannedBytes: 500000,
        maxRows: 500,
        timeoutMs: 30000,
        memoryBudgetMb: 256,
      },
    };

    const generated = sqlGenerator.generate(plan);
    assert.equal(generated.fileCount, 0);
    assert.ok(generated.sql.includes('WHERE 1 = 0'));
  });

  it('SGS-5: should generate keyset continuation predicate and limit+1 for cursor pagination', () => {
    const plan: AuthorizedLogQueryPlan = {
      queryId: 'test-q-cursor',
      tenantId: 'tenant-100',
      authorizedProjects: ['proj-alpha'],
      descriptors: [mockDescriptor],
      timeInterval: {
        startInclusive: '2026-10-26T00:00:00.000Z',
        endExclusive: '2026-10-26T02:00:00.000Z',
      },
      sort: { field: '@timestamp', direction: 'desc' },
      limit: 10,
      cursorPosition: {
        timestamp: '2026-10-26T01:30:00.000Z',
        eventId: '00000000-0000-4000-8000-000000000042',
        segmentId: 'segment-0000.jsonl',
        recordOffset: 5,
      },
      fetchExtraRow: true,
      resourceBudget: {
        maxSegments: 500,
        maxScannedBytes: 500000,
        maxRows: 500,
        timeoutMs: 30000,
        memoryBudgetMb: 256,
      },
    };

    const generated = sqlGenerator.generate(plan);
    assert.ok(generated.sql.includes('"@timestamp" < $6 OR ("@timestamp" = $6 AND "event.id" < $7)'));
    assert.equal(generated.parameters[5], '2026-10-26T01:30:00.000Z');
    assert.equal(generated.parameters[6], '00000000-0000-4000-8000-000000000042');
    assert.equal(generated.parameters[7], 'segment-0000.jsonl');
    assert.equal(generated.parameters[8], 5n);
    assert.equal(generated.parameters[9], 11n); // 10 + 1 for lookahead
  });
});

