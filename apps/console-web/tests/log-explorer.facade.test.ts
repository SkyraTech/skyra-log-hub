import '@angular/compiler';
import 'zone.js';
import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { of, throwError, delay, Observable } from 'rxjs';
import { LogExplorerFacade } from '../src/app/features/log-explorer/application/log-explorer.facade';
import { CursorHistoryService } from '../src/app/features/log-explorer/application/cursor-history.service';
import { FilterStateService } from '../src/app/features/log-explorer/application/filter-state.service';
import { ErrorParserService } from '../src/app/core/errors/error-parser.service';
import {
  CanonicalLogEvent,
  SearchLogsRequest,
  SearchLogsResponse,
  GetLogFacetsResponse,
} from '../src/app/core/http/api-client.port';

const MOCK_EVENT: CanonicalLogEvent = {
  '@timestamp': '2026-10-28T05:00:00.000Z',
  ecs: { version: '8.11.0' },
  event: { id: '00000000-0000-4000-8000-000000000001', action: 'http_request' },
  log: { level: 'error' },
  message: 'Database query connection timeout on master node',
  service: { name: 'billing-api', environment: 'production', version: '2.4.0' },
  skyra: { tenant_id: 'skyra-internal', project_id: 'billing-api', schema_version: '1.0.0' },
  trace: { id: '0123456789abcdef0123456789abcdef' },
  span: { id: '0123456789abcdef' },
};

function createMockFacade(opts?: {
  searchResponse?: SearchLogsResponse;
  searchDelayMs?: number;
  facetsResponse?: GetLogFacetsResponse;
  searchError?: unknown;
}) {
  const cursorHistory = new CursorHistoryService();
  const filterState = new FilterStateService();
  const errorParser = new ErrorParserService();

  const mockContext = {
    tenantId: 'skyra-internal',
    projectId: 'billing-api',
    environment: 'production',
  };

  const mockWorkspaceContext = {
    currentContext: () => mockContext,
  };

  const mockQueryClient = {
    searchLogs: (req: SearchLogsRequest): Observable<SearchLogsResponse> => {
      if (opts?.searchError) {
        return throwError(() => opts.searchError);
      }
      const resp: SearchLogsResponse = opts?.searchResponse ?? {
        events: [MOCK_EVENT],
        pagination: {
          has_more: true,
          next_cursor: 'cursor_token_page_2',
          total_returned: 1,
        },
        statistics: {
          scanned_bytes: 1048576,
          scanned_segments: 4,
          execution_time_ms: 12.4,
          archive_watermark: '2026-10-28T04:59:00.000Z',
        },
        scope: {
          tenant_id: 'skyra-internal',
          searched_projects: ['billing-api'],
        },
      };
      if (opts?.searchDelayMs) {
        return of(resp).pipe(delay(opts.searchDelayMs));
      }
      return of(resp);
    },
    getLogFacets: (): Observable<GetLogFacetsResponse> => {
      const resp: GetLogFacetsResponse = opts?.facetsResponse ?? {
        facets: {
          'service.name': [{ value: 'billing-api', count: 42 }],
          'log.level': [{ value: 'error', count: 10 }, { value: 'info', count: 32 }],
          'environment': [{ value: 'production', count: 42 }],
          'event.action': [{ value: 'http_request', count: 42 }],
        },
        statistics: {
          scanned_bytes: 524288,
          scanned_segments: 2,
          execution_time_ms: 4.8,
          archive_watermark: '2026-10-28T04:59:00.000Z',
        },
        scope: {
          tenant_id: 'skyra-internal',
          searched_projects: ['billing-api'],
        },
      };
      return of(resp);
    },
    getLogEventById: (id: string): Observable<CanonicalLogEvent> => {
      return of({
        ...MOCK_EVENT,
        event: { ...MOCK_EVENT.event, id },
      });
    },
  };

  // Instantiate facade with manually injected dependencies
  const facade = new (LogExplorerFacade as any)();
  (facade as any).queryClient = mockQueryClient;
  (facade as any).workspaceContext = mockWorkspaceContext;
  (facade as any).errorParser = errorParser;
  (facade as any).cursorHistory = cursorHistory;
  (facade as any).filterState = filterState;

  return { facade, cursorHistory, filterState, mockQueryClient };
}

describe('LogExplorerFacade — Search Execution, Facets & Keyset Navigation', () => {
  it('1. Executes search and maps canonical events to stable rows', () => {
    const { facade } = createMockFacade();
    facade.executeSearch(true);

    assert.equal(facade.loading(), false);
    assert.equal(facade.error(), null);

    const rows = facade.rows();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].service, 'billing-api');
    assert.equal(rows[0].severity, 'error');
    assert.equal(rows[0].eventId, '00000000-0000-4000-8000-000000000001');
    assert.ok(rows[0].rowId.includes('billing-api'));

    // Verify statistics populated truthfully
    const stats = facade.statistics();
    assert.ok(stats);
    assert.equal(stats.scanned_segments, 4);
    assert.equal(stats.scanned_bytes, 1048576);

    // Verify pagination updated
    const pag = facade.cursorHistory.state();
    assert.equal(pag.currentPageIndex, 1);
    assert.equal(pag.hasMore, true);
    assert.equal(pag.nextCursor, 'cursor_token_page_2');
    assert.equal(pag.canNext, true);
  });

  it('2. Advances to next page and updates cursor', () => {
    const { facade, cursorHistory } = createMockFacade();
    facade.executeSearch(true);

    facade.nextPage();
    assert.equal(cursorHistory.state().currentPageIndex, 2);
    assert.equal(cursorHistory.state().currentCursor, 'cursor_token_page_2');
  });

  it('3. Loads dynamic facets for filter pills', () => {
    const { facade } = createMockFacade();
    facade.loadFacets();

    const facets = facade.facets();
    assert.equal(facets.loading, false);
    assert.equal(facets.error, null);
    assert.equal(facets.services.length, 1);
    assert.equal(facets.services[0].value, 'billing-api');
    assert.equal(facets.services[0].count, 42);
    assert.equal(facets.levels.length, 2);
  });

  it('4. Selects row and opens event detail drawer', () => {
    const { facade } = createMockFacade();
    facade.executeSearch(true);

    const row = facade.rows()[0];
    facade.selectRow(row);

    assert.equal(facade.selectedRow(), row);

    facade.closeDrawer();
    assert.equal(facade.selectedRow(), null);
  });

  it('5. Fetches single event by ID', () => {
    const { facade } = createMockFacade();
    facade.loadEventById('00000000-0000-4000-8000-000000000099');

    assert.equal(facade.detailLoading(), false);
    assert.equal(facade.selectedRow()?.eventId, '00000000-0000-4000-8000-000000000099');
  });

  it('6. Handles search error and populates correlation details', () => {
    const { facade } = createMockFacade({
      searchError: new Error('Internal query gateway timeout'),
    });

    facade.executeSearch(true);

    assert.equal(facade.loading(), false);
    assert.equal(facade.rows().length, 0);
    assert.ok(facade.error()?.includes('Internal query gateway timeout'));
  });
});
