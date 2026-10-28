import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { AnalyticsMapper } from '../src/app/features/analytics/application/analytics.mapper';
import { AggregateLogsResponse } from '../src/app/core/http/api-client.port';

describe('AnalyticsMapper Unit Tests (LOGHUB-CONSOLE-005)', () => {
  const MOCK_AGGREGATE_RESPONSE: AggregateLogsResponse = {
    aggregations: {
      volume_over_time: {
        type: 'date_histogram',
        buckets: [
          { timestamp: '2026-10-28T04:00:00.000Z', count: 120 },
          { timestamp: '2026-10-28T05:00:00.000Z', count: 280 },
          { timestamp: '2026-10-28T06:00:00.000Z', count: 40 },
        ],
      },
      severity_distribution: {
        type: 'terms',
        buckets: [
          { key: 'info', count: 320 },
          { key: 'warn', count: 80 },
          { key: 'error', count: 35 },
          { key: 'fatal', count: 5 },
        ],
      },
      top_services: {
        type: 'terms',
        buckets: [
          { key: 'auth-service', count: 240 },
          { key: 'billing-api', count: 150 },
          { key: 'gateway', count: 50 },
        ],
      },
      active_services_count: {
        type: 'cardinality',
        value: 3,
      },
      top_errors: {
        type: 'terms',
        buckets: [
          { key: 'DatabaseTimeoutException', count: 25 },
          { key: 'JsonWebTokenError', count: 15 },
        ],
      },
    },
    statistics: {
      execution_time_ms: 18.5,
      scanned_bytes: 4194304,
      scanned_segments: 6,
      archive_watermark: '2026-10-28T06:00:00.000Z',
    },
    scope: {
      tenant_id: 'skyra-internal',
      searched_projects: ['billing-api'],
    },
  };

  it('MAP-1: Correctly maps KPI totals, error rates, and telemetry statistics', () => {
    const kpis = AnalyticsMapper.mapKpis(MOCK_AGGREGATE_RESPONSE);

    // Total logs = 320 + 80 + 35 + 5 = 440
    assert.equal(kpis.totalLogs, 440);
    // Errors = fatal (5) + error (35) = 40
    assert.equal(kpis.errorCount, 40);
    // Error rate = (40 / 440) * 100 = 9.09%
    assert.equal(kpis.errorRatePercent, 9.09);
    // Warnings = 80
    assert.equal(kpis.warningCount, 80);
    // Distinct active services from cardinality
    assert.equal(kpis.activeServicesCount, 3);
    assert.equal(kpis.executionTimeMs, 18.5);
    assert.equal(kpis.scannedBytes, 4194304);
    assert.equal(kpis.scannedSegments, 6);
  });

  it('MAP-2: Safe zero handling prevents divide-by-zero on empty responses', () => {
    const emptyResponse: AggregateLogsResponse = {
      aggregations: {},
      statistics: {
        execution_time_ms: 2.1,
        scanned_bytes: 0,
        scanned_segments: 0,
      },
    };

    const kpis = AnalyticsMapper.mapKpis(emptyResponse);
    assert.equal(kpis.totalLogs, 0);
    assert.equal(kpis.errorCount, 0);
    assert.equal(kpis.errorRatePercent, 0);
    assert.equal(kpis.warningCount, 0);
    assert.equal(kpis.activeServicesCount, 0);
  });

  it('MAP-3: Correctly transforms time-series date-histogram points', () => {
    const points = AnalyticsMapper.mapTimeSeries(MOCK_AGGREGATE_RESPONSE);

    assert.equal(points.length, 3);
    assert.equal(points[0].timestamp, '2026-10-28T04:00:00.000Z');
    assert.equal(points[0].count, 120);
    assert.equal(points[1].count, 280);
    assert.equal(points[2].count, 40);
    assert.ok(points[0].formattedTime.length > 0);
    assert.equal(points[0].formattedDate, '2026-10-28');
  });

  it('MAP-4: Maps severity distribution with canonical ECS color mappings and percentages', () => {
    const items = AnalyticsMapper.mapDistribution(
      MOCK_AGGREGATE_RESPONSE.aggregations['severity_distribution'],
      'severity',
    );

    assert.equal(items.length, 4);
    // Total = 440: info (320) = 72.7%, warn (80) = 18.2%, error (35) = 8.0%, fatal (5) = 1.1%
    assert.equal(items[0].key, 'info');
    assert.equal(items[0].count, 320);
    assert.equal(items[0].percentage, 72.7);
    assert.equal(items[0].color, '#2563EB');

    assert.equal(items[2].key, 'error');
    assert.equal(items[2].color, '#DC2626');

    assert.equal(items[3].key, 'fatal');
    assert.equal(items[3].color, '#991B1B');
  });

  it('MAP-5: Maps top error classifications and service distributions', () => {
    const errors = AnalyticsMapper.mapDistribution(
      MOCK_AGGREGATE_RESPONSE.aggregations['top_errors'],
    );
    assert.equal(errors.length, 2);
    assert.equal(errors[0].key, 'DatabaseTimeoutException');
    assert.equal(errors[0].count, 25);
    // Total = 40; 25 / 40 = 62.5%
    assert.equal(errors[0].percentage, 62.5);

    const services = AnalyticsMapper.mapDistribution(
      MOCK_AGGREGATE_RESPONSE.aggregations['top_services'],
    );
    assert.equal(services.length, 3);
    assert.equal(services[0].key, 'auth-service');
    assert.equal(services[0].count, 240);
  });
});
