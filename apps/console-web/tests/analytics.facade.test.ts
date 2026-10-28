import '@angular/compiler';
import 'zone.js';
import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { of, throwError, delay, Observable } from 'rxjs';
import { AnalyticsFacade } from '../src/app/features/analytics/application/analytics.facade';
import { HttpErrorResponse } from '@angular/common/http';
import { ErrorParserService } from '../src/app/core/errors/error-parser.service';
import {
  AggregateLogsRequest,
  AggregateLogsResponse,
} from '../src/app/core/http/api-client.port';

const MOCK_RESPONSE: AggregateLogsResponse = {
  aggregations: {
    volume_over_time: {
      type: 'date_histogram',
      buckets: [
        { timestamp: '2026-10-28T04:00:00.000Z', count: 50 },
        { timestamp: '2026-10-28T05:00:00.000Z', count: 150 },
      ],
    },
    severity_distribution: {
      type: 'terms',
      buckets: [
        { key: 'info', count: 160 },
        { key: 'error', count: 40 },
      ],
    },
    top_services: {
      type: 'terms',
      buckets: [
        { key: 'billing-api', count: 200 },
      ],
    },
    active_services_count: {
      type: 'cardinality',
      value: 1,
    },
    top_errors: {
      type: 'terms',
      buckets: [
        { key: 'StripeTimeout', count: 40 },
      ],
    },
    event_actions: {
      type: 'terms',
      buckets: [
        { key: 'payment.charge', count: 200 },
      ],
    },
  },
  statistics: {
    execution_time_ms: 14.2,
    scanned_bytes: 2097152,
    scanned_segments: 3,
    archive_watermark: '2026-10-28T05:00:00.000Z',
  },
  scope: {
    tenant_id: 'skyra-internal',
    searched_projects: ['billing-api'],
  },
};

function createMockAnalyticsFacade(opts?: {
  aggregateResponse?: AggregateLogsResponse;
  delayMs?: number;
  aggregateError?: unknown;
}) {
  const facade = new AnalyticsFacade();
  const errorParser = new ErrorParserService();

  let lastNavigatedCommands: unknown[] = [];
  let lastNavigatedExtras: unknown = null;

  const mockRouter = {
    navigate: (commands: unknown[], extras: unknown) => {
      lastNavigatedCommands = commands;
      lastNavigatedExtras = extras;
      return Promise.resolve(true);
    },
  };

  const mockWorkspaceContext = {
    currentContext: () => ({
      tenantId: 'skyra-internal',
      projectId: 'billing-api',
      environment: 'production',
    }),
  };

  let dispatchedRequest: AggregateLogsRequest | null = null;

  const mockQueryClient = {
    aggregateLogs: (req: AggregateLogsRequest): Observable<AggregateLogsResponse> => {
      dispatchedRequest = req;
      if (opts?.aggregateError) {
        return throwError(() => opts.aggregateError);
      }
      const obs = of(opts?.aggregateResponse ?? MOCK_RESPONSE);
      if (opts?.delayMs) {
        return obs.pipe(delay(opts.delayMs));
      }
      return obs;
    },
  };

  (facade as unknown as { queryApiClient: unknown }).queryApiClient = mockQueryClient;
  (facade as unknown as { workspaceContext: unknown }).workspaceContext = mockWorkspaceContext;
  (facade as unknown as { errorParser: unknown }).errorParser = errorParser;
  (facade as unknown as { router: unknown }).router = mockRouter;

  return {
    facade,
    getDispatchedRequest: () => dispatchedRequest,
    getLastNavigated: () => ({ commands: lastNavigatedCommands, extras: lastNavigatedExtras }),
  };
}

describe('AnalyticsFacade Unit Tests (LOGHUB-CONSOLE-005)', () => {
  it('FAC-1: loadOverview dispatches batch aggregations and sets KPI state', () => {
    const { facade, getDispatchedRequest } = createMockAnalyticsFacade();

    facade.loadOverview();

    const req = getDispatchedRequest();
    assert.ok(req);
    assert.deepEqual(req?.projects, ['billing-api']);
    assert.equal(req?.aggregations.length, 4);
    assert.equal(req?.aggregations[0].name, 'volume_over_time');
    assert.equal(req?.aggregations[1].name, 'severity_distribution');
    assert.equal(req?.aggregations[2].name, 'top_services');
    assert.equal(req?.aggregations[3].name, 'active_services_count');

    // Verify signal state
    assert.equal(facade.loading(), false);
    assert.equal(facade.kpis().totalLogs, 200);
    assert.equal(facade.kpis().errorCount, 40);
    assert.equal(facade.kpis().errorRatePercent, 20);
    assert.equal(facade.volumeTrend().length, 2);
    assert.equal(facade.severityDistribution().length, 2);
    assert.equal(facade.serviceDistribution().length, 1);
    assert.ok(facade.lastUpdated());
  });

  it('FAC-2: loadAnalytics dispatches error and event action breakdowns', () => {
    const { facade, getDispatchedRequest } = createMockAnalyticsFacade();

    facade.loadAnalytics();

    const req = getDispatchedRequest();
    assert.ok(req);
    assert.equal(req?.aggregations.length, 5);
    assert.equal(req?.aggregations[3].name, 'top_errors');
    assert.equal(req?.aggregations[4].name, 'event_actions');

    assert.equal(facade.errorBreakdown().length, 1);
    assert.equal(facade.errorBreakdown()[0].key, 'StripeTimeout');
    assert.equal(facade.eventActionBreakdown().length, 1);
    assert.equal(facade.eventActionBreakdown()[0].key, 'payment.charge');
  });

  it('FAC-3: Monotonic queryGeneration discards out-of-order delayed responses', async () => {
    let callCount = 0;
    const facade = new AnalyticsFacade();

    const mockWorkspaceContext = {
      currentContext: () => ({
        tenantId: 'skyra-internal',
        projectId: 'billing-api',
        environment: 'production',
      }),
    };

    const mockQueryClient = {
      aggregateLogs: (): Observable<AggregateLogsResponse> => {
        callCount++;
        if (callCount === 1) {
          // Slow first query (stale)
          return of({
            ...MOCK_RESPONSE,
            statistics: { execution_time_ms: 100, scanned_bytes: 999999, scanned_segments: 1 },
          }).pipe(delay(50));
        }
        // Fast second query (fresh)
        return of({
          ...MOCK_RESPONSE,
          statistics: { execution_time_ms: 10, scanned_bytes: 111111, scanned_segments: 1 },
        });
      },
    };

    (facade as unknown as { queryApiClient: unknown }).queryApiClient = mockQueryClient;
    (facade as unknown as { workspaceContext: unknown }).workspaceContext = mockWorkspaceContext;
    (facade as unknown as { errorParser: unknown }).errorParser = new ErrorParserService();

    // Dispatch Query 1 (slow)
    facade.loadOverview();
    // Dispatch Query 2 (immediate override)
    facade.loadOverview();

    // Query 2 resolves immediately
    assert.equal(facade.kpis().scannedBytes, 111111);

    // Wait for Query 1 delay to expire
    await new Promise((resolve) => setTimeout(resolve, 80));

    // Stale Query 1 must NOT overwrite Query 2 results!
    assert.equal(facade.kpis().scannedBytes, 111111);
  });

  it('FAC-4: Correctly parses RFC 7807 problem details upon failure', () => {
    const errorResponse = new HttpErrorResponse({
      status: 403,
      error: {
        type: 'https://specs.skyra-tech.com/errors/unauthorized-project',
        title: 'Unauthorized Project Access',
        status: 403,
        detail: 'User does not possess membership in project billing-api.',
        instance: 'urn:skyra:correlation:12345',
      },
    });

    const { facade } = createMockAnalyticsFacade({ aggregateError: errorResponse });

    facade.loadOverview();

    assert.equal(facade.loading(), false);
    assert.equal(facade.error(), 'User does not possess membership in project billing-api.');
    assert.equal(facade.errorCorrelationId(), 'urn:skyra:correlation:12345');
  });

  it('FAC-5: navigateToLogs generates correct router parameters for drilldowns', () => {
    const { facade, getLastNavigated } = createMockAnalyticsFacade();

    // 1. Drilldown to errors
    facade.navigateToLogs({ levels: ['error', 'fatal'] });
    let nav = getLastNavigated();
    assert.deepEqual(nav.commands, ['/logs']);
    assert.deepEqual(nav.extras, {
      queryParams: {
        levels: 'error,fatal',
        range: '1h',
      },
    });

    // 2. Drilldown to specific service
    facade.navigateToLogs({ services: ['auth-service'] });
    nav = getLastNavigated();
    assert.deepEqual(nav.extras, {
      queryParams: {
        services: 'auth-service',
        range: '1h',
      },
    });

    // 3. Drilldown to exact custom time bucket
    facade.navigateToLogs({
      timeRange: {
        start: '2026-10-28T04:00:00.000Z',
        end: '2026-10-28T05:00:00.000Z',
      },
    });
    nav = getLastNavigated();
    assert.deepEqual(nav.extras, {
      queryParams: {
        range: 'custom',
        start: '2026-10-28T04:00:00.000Z',
        end: '2026-10-28T05:00:00.000Z',
      },
    });
  });

  it('FAC-6: resetState wipes state and cancels in-flight subscriptions', () => {
    const { facade } = createMockAnalyticsFacade();
    facade.loadOverview();
    assert.equal(facade.kpis().totalLogs, 200);

    facade.resetState();
    assert.equal(facade.kpis().totalLogs, 0);
    assert.equal(facade.volumeTrend().length, 0);
    assert.equal(facade.error(), null);
    assert.equal(facade.lastUpdated(), null);
  });
});
