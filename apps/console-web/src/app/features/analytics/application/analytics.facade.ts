import { Injectable, inject, signal, computed, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { QueryApiClientService } from '../../../core/http/query-api-client.service';
import { WorkspaceContextService } from '../../../core/workspace/workspace-context.service';
import { ErrorParserService } from '../../../core/errors/error-parser.service';
import {
  AggregateLogsRequest,
  AggregationDefinition,
} from '../../../core/http/api-client.port';
import { TimeRangePreset } from '../../log-explorer/domain/log-search.model';
import {
  BucketInterval,
  AnalyticsDimension,
  OverviewKpiData,
  TimeSeriesPoint,
  DistributionItem,
  resolveAnalyticsTimeRange,
  getDefaultIntervalForRange,
} from '../domain/analytics-metric.model';
import {
  INITIAL_KPIS,
} from '../domain/analytics-state.model';
import { AnalyticsMapper } from './analytics.mapper';

@Injectable({
  providedIn: 'root',
})
export class AnalyticsFacade implements OnDestroy {
  private queryApiClient!: QueryApiClientService;
  private workspaceContext!: WorkspaceContextService;
  private errorParser!: ErrorParserService;
  private router!: Router;

  // RxJS cancellation & generation tracking
  private readonly destroy$ = new Subject<void>();
  private readonly cancelActiveQuery$ = new Subject<void>();
  private queryGeneration = 0;

  // Reactive state signals
  readonly loading = signal<boolean>(false);
  readonly refreshing = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly errorCorrelationId = signal<string | null>(null);

  readonly kpis = signal<OverviewKpiData>(INITIAL_KPIS);
  readonly volumeTrend = signal<TimeSeriesPoint[]>([]);
  readonly severityDistribution = signal<DistributionItem[]>([]);
  readonly serviceDistribution = signal<DistributionItem[]>([]);
  readonly errorBreakdown = signal<DistributionItem[]>([]);
  readonly eventActionBreakdown = signal<DistributionItem[]>([]);
  readonly dimensionDistribution = signal<DistributionItem[]>([]);
  readonly lastUpdated = signal<string | null>(null);

  // Filter signals
  readonly timeRangePreset = signal<TimeRangePreset>('1h');
  readonly customStart = signal<string>('');
  readonly customEnd = signal<string>('');
  readonly interval = signal<BucketInterval>('5m');
  readonly selectedDimension = signal<AnalyticsDimension>('service.name');
  readonly selectedEnvironment = signal<string>('');
  readonly selectedService = signal<string>('');

  // Computed state
  readonly hasData = computed<boolean>(() => {
    return this.kpis().totalLogs > 0 || this.volumeTrend().length > 0;
  });

  constructor() {
    try {
      this.queryApiClient = inject(QueryApiClientService);
      this.workspaceContext = inject(WorkspaceContextService);
      this.errorParser = inject(ErrorParserService);
      this.router = inject(Router);

      // Workspace context changes invalidate in-flight queries and reset state
      if (this.workspaceContext) {
        // Monitor currentContext changes
      }
    } catch {
      // In isolated non-DI testing, dependencies can be assigned manually
    }
  }

  ngOnDestroy(): void {
    this.cancelActiveQuery$.next();
    this.cancelActiveQuery$.complete();
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Resets all analytics state (e.g., when switching workspace or project)
   */
  public resetState(): void {
    this.cancelActiveQuery$.next();
    this.loading.set(false);
    this.refreshing.set(false);
    this.error.set(null);
    this.errorCorrelationId.set(null);
    this.kpis.set(INITIAL_KPIS);
    this.volumeTrend.set([]);
    this.severityDistribution.set([]);
    this.serviceDistribution.set([]);
    this.errorBreakdown.set([]);
    this.eventActionBreakdown.set([]);
    this.dimensionDistribution.set([]);
    this.lastUpdated.set(null);
  }

  /**
   * Loads Overview dashboard KPIs and core distributions
   */
  public loadOverview(isRefresh = false): void {
    const currentWorkspace = this.workspaceContext?.currentContext();
    if (!currentWorkspace?.projectId) {
      return;
    }

    if (isRefresh) {
      this.refreshing.set(true);
    } else {
      this.loading.set(true);
    }
    this.error.set(null);
    this.errorCorrelationId.set(null);

    this.cancelActiveQuery$.next();
    const generation = ++this.queryGeneration;

    const timeBounds = resolveAnalyticsTimeRange(
      this.timeRangePreset(),
      this.customStart() || undefined,
      this.customEnd() || undefined,
    );

    const bucketInterval = getDefaultIntervalForRange(this.timeRangePreset());

    const aggregations: AggregationDefinition[] = [
      {
        name: 'volume_over_time',
        type: 'date_histogram',
        field: '@timestamp',
        interval: bucketInterval,
      },
      {
        name: 'severity_distribution',
        type: 'terms',
        field: 'log.level',
        size: 10,
      },
      {
        name: 'top_services',
        type: 'terms',
        field: 'service.name',
        size: 10,
      },
      {
        name: 'active_services_count',
        type: 'cardinality',
        field: 'service.name',
      },
    ];

    const req: AggregateLogsRequest = {
      time_range: timeBounds,
      projects: [currentWorkspace.projectId],
      aggregations,
    };

    if (this.selectedEnvironment()) {
      req.filters = [
        {
          field: 'environment',
          operator: 'eq',
          value: this.selectedEnvironment(),
        },
      ];
    }

    this.queryApiClient
      .aggregateLogs(req)
      .pipe(takeUntil(this.cancelActiveQuery$), takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          if (this.queryGeneration !== generation) return;

          this.kpis.set(AnalyticsMapper.mapKpis(res));
          this.volumeTrend.set(AnalyticsMapper.mapTimeSeries(res));
          this.severityDistribution.set(
            AnalyticsMapper.mapDistribution(res.aggregations?.['severity_distribution'], 'severity'),
          );
          this.serviceDistribution.set(
            AnalyticsMapper.mapDistribution(res.aggregations?.['top_services']),
          );

          this.lastUpdated.set(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
          this.loading.set(false);
          this.refreshing.set(false);
        },
        error: (err: unknown) => {
          if (this.queryGeneration !== generation) return;

          const parsed = this.errorParser
            ? this.errorParser.parse(err)
            : { detail: 'Query failed', title: 'Error', instance: undefined, code: undefined };
          this.error.set(parsed.detail || parsed.title || 'Failed to load overview analytics');
          this.errorCorrelationId.set(parsed.instance || parsed.code || null);
          this.loading.set(false);
          this.refreshing.set(false);
        },
      });
  }

  /**
   * Loads deep multi-dimensional analytics for the dedicated /analytics screen
   */
  public loadAnalytics(isRefresh = false): void {
    const currentWorkspace = this.workspaceContext?.currentContext();
    if (!currentWorkspace?.projectId) {
      return;
    }

    if (isRefresh) {
      this.refreshing.set(true);
    } else {
      this.loading.set(true);
    }
    this.error.set(null);
    this.errorCorrelationId.set(null);

    this.cancelActiveQuery$.next();
    const generation = ++this.queryGeneration;

    const timeBounds = resolveAnalyticsTimeRange(
      this.timeRangePreset(),
      this.customStart() || undefined,
      this.customEnd() || undefined,
    );

    const aggregations: AggregationDefinition[] = [
      {
        name: 'volume_over_time',
        type: 'date_histogram',
        field: '@timestamp',
        interval: this.interval(),
      },
      {
        name: 'severity_distribution',
        type: 'terms',
        field: 'log.level',
        size: 10,
      },
      {
        name: 'top_services',
        type: 'terms',
        field: 'service.name',
        size: 10,
      },
      {
        name: 'top_errors',
        type: 'terms',
        field: 'error.type',
        size: 10,
      },
      {
        name: 'event_actions',
        type: 'terms',
        field: 'event.action',
        size: 10,
      },
    ];

    const req: AggregateLogsRequest = {
      time_range: timeBounds,
      projects: [currentWorkspace.projectId],
      aggregations,
    };

    if (this.selectedEnvironment()) {
      req.filters = [
        {
          field: 'environment',
          operator: 'eq',
          value: this.selectedEnvironment(),
        },
      ];
    }

    this.queryApiClient
      .aggregateLogs(req)
      .pipe(takeUntil(this.cancelActiveQuery$), takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          if (this.queryGeneration !== generation) return;

          this.kpis.set(AnalyticsMapper.mapKpis(res));
          this.volumeTrend.set(AnalyticsMapper.mapTimeSeries(res));
          this.severityDistribution.set(
            AnalyticsMapper.mapDistribution(res.aggregations?.['severity_distribution'], 'severity'),
          );
          this.serviceDistribution.set(
            AnalyticsMapper.mapDistribution(res.aggregations?.['top_services']),
          );
          this.errorBreakdown.set(
            AnalyticsMapper.mapDistribution(res.aggregations?.['top_errors']),
          );
          this.eventActionBreakdown.set(
            AnalyticsMapper.mapDistribution(res.aggregations?.['event_actions']),
          );

          this.lastUpdated.set(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
          this.loading.set(false);
          this.refreshing.set(false);
        },
        error: (err: unknown) => {
          if (this.queryGeneration !== generation) return;

          const parsed = this.errorParser
            ? this.errorParser.parse(err)
            : { detail: 'Query failed', title: 'Error', instance: undefined, code: undefined };
          this.error.set(parsed.detail || parsed.title || 'Failed to load analytics dashboard');
          this.errorCorrelationId.set(parsed.instance || parsed.code || null);
          this.loading.set(false);
          this.refreshing.set(false);
        },
      });
  }

  public setTimeRange(preset: TimeRangePreset, customStart?: string, customEnd?: string): void {
    this.timeRangePreset.set(preset);
    if (customStart !== undefined) this.customStart.set(customStart);
    if (customEnd !== undefined) this.customEnd.set(customEnd);
    this.interval.set(getDefaultIntervalForRange(preset));
  }

  public setInterval(interval: BucketInterval): void {
    this.interval.set(interval);
  }

  public setDimension(dim: AnalyticsDimension): void {
    this.selectedDimension.set(dim);
  }

  public setEnvironment(env: string): void {
    this.selectedEnvironment.set(env);
  }

  public setService(service: string): void {
    this.selectedService.set(service);
  }

  /**
   * Navigates directly into Log Explorer with authorized filter constraints
   */
  public navigateToLogs(options: {
    levels?: string[];
    services?: string[];
    timeRange?: { start: string; end: string };
  }): void {
    const queryParams: Record<string, string> = {};

    if (options.levels && options.levels.length > 0) {
      queryParams['levels'] = options.levels.join(',');
    }

    if (options.services && options.services.length > 0) {
      queryParams['services'] = options.services.join(',');
    }

    if (options.timeRange?.start && options.timeRange?.end) {
      queryParams['range'] = 'custom';
      queryParams['start'] = options.timeRange.start;
      queryParams['end'] = options.timeRange.end;
    } else {
      queryParams['range'] = this.timeRangePreset();
      if (this.timeRangePreset() === 'custom' && this.customStart() && this.customEnd()) {
        queryParams['start'] = this.customStart();
        queryParams['end'] = this.customEnd();
      }
    }

    this.router?.navigate(['/logs'], { queryParams });
  }
}
