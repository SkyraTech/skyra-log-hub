import { Injectable, inject, signal, computed, effect } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { QueryApiClientService } from '../../../core/http/query-api-client.service';
import { WorkspaceContextService } from '../../../core/workspace/workspace-context.service';
import { ErrorParserService } from '../../../core/errors/error-parser.service';
import { CursorHistoryService } from './cursor-history.service';
import { FilterStateService } from './filter-state.service';
import { resolveTimeRange, TimeRangePreset } from '../domain/log-search.model';
import { LogExplorerRow, mapCanonicalEventToRow } from '../domain/log-event.model';
import { FacetsState, INITIAL_FACETS_STATE, FacetCount } from '../domain/log-filter.model';
import { CanonicalLogEvent, SearchLogsRequest, SearchStatistics, SearchScope } from '../../../core/http/api-client.port';

@Injectable()
export class LogExplorerFacade {
  queryClient!: QueryApiClientService;
  workspaceContext!: WorkspaceContextService;
  errorParser!: ErrorParserService;
  cursorHistory!: CursorHistoryService;
  filterState!: FilterStateService;

  // Reactive state signals
  readonly rows = signal<LogExplorerRow[]>([]);
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly errorCorrelationId = signal<string | null>(null);
  readonly statistics = signal<SearchStatistics | null>(null);
  readonly scope = signal<SearchScope | null>(null);
  readonly facets = signal<FacetsState>(INITIAL_FACETS_STATE);

  // Detail drawer state
  readonly selectedRow = signal<LogExplorerRow | null>(null);
  readonly detailLoading = signal<boolean>(false);
  readonly detailError = signal<string | null>(null);

  // Cancellation and Generation safety invariants
  private queryGeneration = 0;
  private readonly cancelActiveQuery$ = new Subject<void>();
  private readonly cancelActiveFacets$ = new Subject<void>();
  private lastProjectId: string | null = null;

  constructor() {
    try {
      this.queryClient = inject(QueryApiClientService);
      this.workspaceContext = inject(WorkspaceContextService);
      this.errorParser = inject(ErrorParserService);
      this.cursorHistory = inject(CursorHistoryService);
      this.filterState = inject(FilterStateService);

      // React to workspace project/tenant switches
      effect(() => {
        const current = this.workspaceContext?.currentContext();
        const currentProjectId = current?.projectId ?? null;

        if (this.lastProjectId !== null && this.lastProjectId !== currentProjectId) {
          // Project changed: cancel in-flight, reset pagination, clear rows immediately to avoid showing stale tenant data
          this.cancelActiveQuery$.next();
          this.cursorHistory.reset();
          this.rows.set([]);
          this.selectedRow.set(null);
          this.error.set(null);
          if (currentProjectId) {
            this.executeSearch(true);
            this.loadFacets();
          }
        }
        this.lastProjectId = currentProjectId;
      });
    } catch {
      // In direct non-DI unit tests, dependencies are set manually
    }
  }

  /**
   * Executes a log search.
   * @param resetCursor If true, resets pagination to page 1.
   * @param cursorOverride Optional cursor for forward/backward pagination.
   */
  executeSearch(resetCursor = false, cursorOverride?: string | null): void {
    const currentWorkspace = this.workspaceContext.currentContext();
    const activeProject = currentWorkspace?.projectId;

    if (!activeProject) {
      this.error.set('No active project selected. Please select an authorized workspace project.');
      this.rows.set([]);
      this.loading.set(false);
      return;
    }

    if (resetCursor) {
      this.cursorHistory.reset();
    }

    // Cancel prior search request
    this.cancelActiveQuery$.next();

    // Increment request generation to protect against race conditions and out-of-order responses
    const currentGen = ++this.queryGeneration;

    this.loading.set(true);
    this.error.set(null);
    this.errorCorrelationId.set(null);

    const pageSize = this.cursorHistory.getPageSize();
    const criteria = this.filterState.getCriteria(pageSize);
    const timeRange = resolveTimeRange(
      criteria.timeRangePreset,
      criteria.customStart,
      criteria.customEnd,
    );

    const cursorToUse = cursorOverride !== undefined
      ? (cursorOverride ?? undefined)
      : (this.cursorHistory.getCurrentCursor() ?? undefined);

    const request: SearchLogsRequest = {
      time_range: timeRange,
      projects: [activeProject],
      limit: pageSize,
      cursor: cursorToUse,
    };

    if (criteria.queryText) {
      request.query_text = criteria.queryText;
    }
    if (criteria.traceId) {
      request.trace_id = criteria.traceId;
    }
    if (criteria.levels.length > 0) {
      request.levels = criteria.levels as any;
    }
    if (criteria.services.length > 0) {
      request.services = criteria.services;
    }
    if (criteria.environments.length > 0) {
      request.environments = criteria.environments as any;
    }

    this.queryClient
      .searchLogs(request)
      .pipe(takeUntil(this.cancelActiveQuery$))
      .subscribe({
        next: (response) => {
          // Invariant: Discard stale response if a newer query generation was dispatched
          if (currentGen !== this.queryGeneration) {
            return;
          }

          const mappedRows = (response.events || []).map((ev, idx) => mapCanonicalEventToRow(ev, idx));
          this.rows.set(mappedRows);
          this.statistics.set(response.statistics ?? null);
          this.scope.set(response.scope ?? null);

          this.cursorHistory.updateFromResponse(
            response.pagination?.has_more ?? false,
            response.pagination?.next_cursor ?? null,
            response.pagination?.total_returned ?? mappedRows.length,
          );

          this.loading.set(false);
        },
        error: (err: unknown) => {
          if (currentGen !== this.queryGeneration) {
            return;
          }

          const parsed = this.errorParser.parse(err);
          this.error.set(parsed.detail || parsed.title);
          this.errorCorrelationId.set(parsed.instance || parsed.code || null);
          this.loading.set(false);
        },
      });
  }

  /**
   * Navigate forward to next page.
   */
  nextPage(): void {
    const nextCursor = this.cursorHistory.advanceToNext();
    if (nextCursor) {
      this.executeSearch(false, nextCursor);
    }
  }

  /**
   * Navigate backward to previous page.
   */
  prevPage(): void {
    const prevCursor = this.cursorHistory.retreatToPrevious();
    this.executeSearch(false, prevCursor);
  }

  /**
   * Change page size and reset cursor.
   */
  setPageSize(newSize: number): void {
    this.cursorHistory.setPageSize(newSize);
    this.executeSearch(true);
  }

  /**
   * Cancel active search.
   */
  cancelSearch(): void {
    this.cancelActiveQuery$.next();
    this.loading.set(false);
  }

  /**
   * Load dynamic facets for filter dropdowns.
   */
  loadFacets(): void {
    const currentWorkspace = this.workspaceContext.currentContext();
    const activeProject = currentWorkspace?.projectId;

    if (!activeProject) {
      return;
    }

    this.cancelActiveFacets$.next();
    this.facets.update((f) => ({ ...f, loading: true, error: null }));

    const criteria = this.filterState.getCriteria(50);
    const timeRange = resolveTimeRange(
      criteria.timeRangePreset,
      criteria.customStart,
      criteria.customEnd,
    );

    this.queryClient
      .getLogFacets({
        time_range: timeRange,
        projects: [activeProject],
        facet_fields: ['service.name', 'log.level', 'environment', 'event.action'],
      })
      .pipe(takeUntil(this.cancelActiveFacets$))
      .subscribe({
        next: (res) => {
          const rawFacets = res.facets || {};
          const services: FacetCount[] = (rawFacets['service.name'] || []).map((f) => ({ value: f.value, count: f.count }));
          const levels: FacetCount[] = (rawFacets['log.level'] || []).map((f) => ({ value: f.value, count: f.count }));
          const environments: FacetCount[] = (rawFacets['environment'] || []).map((f) => ({ value: f.value, count: f.count }));
          const actions: FacetCount[] = (rawFacets['event.action'] || []).map((f) => ({ value: f.value, count: f.count }));

          this.facets.set({
            services,
            levels,
            environments,
            actions,
            loading: false,
            error: null,
          });
        },
        error: (err: unknown) => {
          const parsed = this.errorParser.parse(err);
          this.facets.update((f) => ({
            ...f,
            loading: false,
            error: parsed.detail || parsed.title,
          }));
        },
      });
  }

  /**
   * Select a row and open the event detail drawer.
   */
  selectRow(row: LogExplorerRow): void {
    this.selectedRow.set(row);
    this.detailError.set(null);
  }

  /**
   * Close the event detail drawer.
   */
  closeDrawer(): void {
    this.selectedRow.set(null);
    this.detailError.set(null);
  }

  /**
   * Fetch complete event by ID directly from backend.
   */
  loadEventById(eventId: string, timestamp?: string): void {
    const currentWorkspace = this.workspaceContext.currentContext();
    const activeProject = currentWorkspace?.projectId;

    if (!activeProject) {
      this.detailError.set('No active project context for event lookup.');
      return;
    }

    this.detailLoading.set(true);
    this.detailError.set(null);

    this.queryClient.getLogEventById(eventId, activeProject, timestamp).subscribe({
      next: (canonicalEvent) => {
        const row = mapCanonicalEventToRow(canonicalEvent, 0);
        this.selectedRow.set(row);
        this.detailLoading.set(false);
      },
      error: (err: unknown) => {
        const parsed = this.errorParser.parse(err);
        this.detailError.set(parsed.detail || parsed.title);
        this.detailLoading.set(false);
      },
    });
  }
}
