import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { SqlGeneratorService } from '../../../src/modules/query-execution/application/sql-generator.service.js';
import { AnalyticsSqlGeneratorService } from '../../../src/modules/query-execution/application/analytics-sql-generator.service.js';
import type { AuthorizedAggregationPlan } from '../../../src/modules/analytics/domain/aggregation.model.js';
import type { AuthorizedFacetsPlan } from '../../../src/modules/analytics/domain/facet.model.js';
import type { TrustedArchiveSegmentDescriptor } from '../../../src/modules/archive-discovery/domain/archive-segment-descriptor.model.js';

describe('AnalyticsSqlGeneratorService Unit Tests (LOGHUB-QUERY-005)', () => {
  const sqlGenerator = new SqlGeneratorService();
  const generator = new AnalyticsSqlGeneratorService(sqlGenerator);

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

  const baseAggPlan: AuthorizedAggregationPlan = {
    queryId: 'agg-query-1',
    tenantId: 'tenant-100',
    authorizedProjects: ['proj-alpha'],
    descriptors: [mockDescriptor],
    timeInterval: {
      startInclusive: '2026-10-26T00:00:00.000Z',
      endExclusive: '2026-10-26T12:00:00.000Z',
    },
    aggregations: [
      {
        name: 'volume_over_time',
        type: 'date_histogram',
        interval: '1h',
      },
    ],
    resourceBudget: {
      maxSegments: 50,
      maxScannedBytes: 10_000_000,
      timeoutMs: 15_000,
    },
  };

  it('ASG-1: should generate parameterized date_histogram query with UTC time_bucket', () => {
    const generated = generator.generateAggregationQuery(baseAggPlan, baseAggPlan.aggregations[0]!);

    assert.ok(generated.sql.includes('read_ndjson_objects([$1]'));
    assert.ok(generated.sql.includes('time_bucket(INTERVAL \'1 hour\''));
    assert.ok(generated.sql.includes('CAST(json_extract_string(json, \'$."@timestamp"\') AS TIMESTAMP)'));
    assert.ok(generated.sql.includes('GROUP BY bucket_ts ORDER BY bucket_ts ASC'));
    assert.ok(generated.parameters.length >= 4);
  });

  it('ASG-2: should generate parameterized terms aggregation query with ORDER BY count DESC', () => {
    const termsPlan: AuthorizedAggregationPlan = {
      ...baseAggPlan,
      aggregations: [
        {
          name: 'by_severity',
          type: 'terms',
          field: 'log.level',
          size: 10,
        },
      ],
    };

    const generated = generator.generateAggregationQuery(termsPlan, termsPlan.aggregations[0]!);

    assert.ok(generated.sql.includes('SELECT'));
    assert.ok(generated.sql.includes('GROUP BY key ORDER BY count DESC, key ASC LIMIT 10'));
  });

  it('ASG-3: should generate parameterized cardinality aggregation query with count(DISTINCT ...)', () => {
    const cardPlan: AuthorizedAggregationPlan = {
      ...baseAggPlan,
      aggregations: [
        {
          name: 'unique_services',
          type: 'cardinality',
          field: 'service.name',
        },
      ],
    };

    const generated = generator.generateAggregationQuery(cardPlan, cardPlan.aggregations[0]!);

    assert.ok(generated.sql.includes('count(DISTINCT '));
    assert.ok(generated.sql.includes('read_ndjson_objects'));
  });

  it('ASG-4: should generate parameterized facet discovery query for allowed field', () => {
    const facetPlan: AuthorizedFacetsPlan = {
      queryId: 'facet-q-1',
      tenantId: 'tenant-100',
      authorizedProjects: ['proj-alpha'],
      descriptors: [mockDescriptor],
      timeInterval: {
        startInclusive: '2026-10-26T00:00:00.000Z',
        endExclusive: '2026-10-26T12:00:00.000Z',
      },
      facetFields: ['service.name', 'log.level'],
      resourceBudget: {
        maxSegments: 50,
        maxScannedBytes: 10_000_000,
        timeoutMs: 15_000,
      },
    };

    const generated = generator.generateFacetQuery(facetPlan, 'service.name');

    assert.ok(generated.sql.includes('GROUP BY value ORDER BY count DESC, value ASC LIMIT 50'));
  });

  it('ASG-5: should return empty SQL on zero descriptors without DuckDB errors', () => {
    const emptyPlan: AuthorizedAggregationPlan = {
      ...baseAggPlan,
      descriptors: [],
    };

    const generated = generator.generateAggregationQuery(emptyPlan, emptyPlan.aggregations[0]!);
    assert.ok(generated.sql.includes('WHERE 1 = 0'));
    assert.equal(generated.parameters.length, 0);
  });
});
