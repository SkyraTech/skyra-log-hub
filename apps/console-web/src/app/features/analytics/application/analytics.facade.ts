import {DashboardRefreshLoop} from './dashboard-refresh-loop';
import {DashboardApi} from './dashboard-api.service';
import { Injectable, inject, signal, computed, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject, takeUntil, forkJoin } from 'rxjs';
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
  INTERVAL_WIDTHS,
} from '../domain/analytics-metric.model';
import {
  INITIAL_KPIS,
} from '../domain/analytics-state.model';
import { AnalyticsMapper } from './analytics.mapper';

@Injectable({
  providedIn: 'root',
})
export class AnalyticsFacade implements OnDestroy {
  private disposed=false;
  private dashboardApi!:DashboardApi;
  readonly dashboard=signal<any>(null);readonly correlationId=signal('');readonly selectedLevels=signal<string[]>([]);readonly topN=signal(5);readonly trendMetric=signal('events');readonly autoRefreshSeconds=signal(0);readonly stale=signal(false);readonly refreshOrigin=signal('manual');readonly refreshStopped=signal(false);
  private autoLoop=new DashboardRefreshLoop(()=>this.loadDashboard(true,true),()=>this.loading()||this.refreshing());
  private visibility=()=>this.autoLoop.visibilityChanged();
  startRefresh(){if(this.disposed)return;this.autoLoop.start();if(typeof document!=='undefined')document.addEventListener('visibilitychange',this.visibility);}
  setAutoRefresh(seconds:number){this.autoLoop.set(seconds);this.autoRefreshSeconds.set(seconds);}
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
  readonly errorTrend=signal<TimeSeriesPoint[]>([]);
  readonly warningTrend=signal<TimeSeriesPoint[]>([]);
  readonly environmentDistribution=signal<DistributionItem[]>([]);
  readonly partialResult=signal(false);
  readonly appliedScope=signal<{project:string;tenant:string;start:string;end:string;intervalMs:number;environments:string[];services:string[];correlationId?:string;levels?:string[]}|null>(null);
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
      this.dashboardApi=inject(DashboardApi);

      // Workspace context changes invalidate in-flight queries and reset state
      if (this.workspaceContext) {
        // Monitor currentContext changes
      }
    } catch {
      // In isolated non-DI testing, dependencies can be assigned manually
    }
  }

  ngOnDestroy(): void {
    this.disposed=true;this.autoLoop.stop();if(typeof document!=='undefined')document.removeEventListener('visibilitychange',this.visibility);
    this.cancelActiveQuery$.next();
    this.cancelActiveQuery$.complete();
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Resets all analytics state (e.g., when switching workspace or project)
   */
  public resetState(): void {
    this.queryGeneration++;this.resetDashboardData();this.dashboard.set(null);this.stale.set(false);
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
    const workspace=this.workspaceContext?.currentContext();
    this.resetDashboardData();this.loading.set(false);this.refreshing.set(false);
    this.cancelActiveQuery$.next();
    const generation=++this.queryGeneration;
    this.error.set(null);this.errorCorrelationId.set(null);
    if(!workspace?.projectId){this.loading.set(false);this.refreshing.set(false);return;}
    let bounds:{start:string;end:string};
    try{bounds=resolveAnalyticsTimeRange(this.timeRangePreset(),this.customStart()||undefined,this.customEnd()||undefined);}
    catch(e){this.error.set(e instanceof Error?e.message:'Invalid UTC range.');return;}
    const width=INTERVAL_WIDTHS[this.interval()];
    if(!width||Math.floor((Date.parse(bounds.end)-1)/width)-Math.floor(Date.parse(bounds.start)/width)+1>2000){this.error.set('Choose a wider bucket: at most 2000 UTC buckets are supported.');return;}
    this.loading.set(!isRefresh);this.refreshing.set(isRefresh);
    const request:AggregateLogsRequest={time_range:bounds,projects:[workspace.projectId],include_empty_buckets:true,aggregations:[
      {name:'volume_over_time',type:'date_histogram',field:'@timestamp',interval:this.interval()},
      {name:'severity_distribution',type:'terms',field:'log.level',size:6},
      {name:'top_services',type:'terms',field:'service.name',size:10},
      {name:'environment_distribution',type:'terms',field:'environment',size:5},
      {name:'active_services_count',type:'cardinality',field:'service.name'},
    ],...(this.selectedEnvironment()?{environments:[this.selectedEnvironment()]}:{}),...(this.selectedService()?{services:[this.selectedService()]}:{})};
    const trend=(levels:string[])=>({...request,levels,aggregations:[request.aggregations[0]]});
    forkJoin([this.queryApiClient.aggregateLogs(request),this.queryApiClient.aggregateLogs(trend(['error','fatal'])),this.queryApiClient.aggregateLogs(trend(['warn']))])
      .pipe(takeUntil(this.cancelActiveQuery$),takeUntil(this.destroy$)).subscribe({
        next:([main,errors,warnings])=>{
          if(generation!==this.queryGeneration)return;
          this.kpis.set(AnalyticsMapper.mapKpis(main));
          this.volumeTrend.set(AnalyticsMapper.mapTimeSeries(main));this.errorTrend.set(AnalyticsMapper.mapTimeSeries(errors));this.warningTrend.set(AnalyticsMapper.mapTimeSeries(warnings));
          this.severityDistribution.set(AnalyticsMapper.mapDistribution(main.aggregations['severity_distribution'],'severity'));
          this.serviceDistribution.set(AnalyticsMapper.mapDistribution(main.aggregations['top_services'],undefined,this.kpis().totalLogs));
          this.environmentDistribution.set(AnalyticsMapper.mapDistribution(main.aggregations['environment_distribution']));
          const inconsistent=this.volumeTrend().reduce((n,p)=>n+p.count,0)!==this.kpis().totalLogs||this.errorTrend().reduce((n,p)=>n+p.count,0)!==this.kpis().errorCount||this.warningTrend().reduce((n,p)=>n+p.count,0)!==this.kpis().warningCount;
          this.partialResult.set([main,errors,warnings].some(r=>r.statistics?.partial_results===true)||inconsistent);
          this.appliedScope.set({project:workspace.projectId,tenant:workspace.tenantId,...bounds,intervalMs:width,environments:request.environments??[],services:request.services??[]});
          this.lastUpdated.set(new Date().toISOString());this.loading.set(false);this.refreshing.set(false);
        },
        error:(err:unknown)=>{if(generation!==this.queryGeneration)return;const parsed=this.errorParser?.parse(err);this.error.set(parsed?.detail||parsed?.title||'Analytics is unavailable. Retry.');this.errorCorrelationId.set(parsed?.instance||parsed?.code||null);this.resetDashboardData();this.loading.set(false);this.refreshing.set(false);},
      });
  }

  public loadDashboard(isRefresh=false,automatic=false):void{
    if(this.disposed)return;
    if(isRefresh&&(this.loading()||this.refreshing()))return;
    if(automatic&&this.refreshStopped())return;
    const workspace=this.workspaceContext?.currentContext();if(!workspace?.projectId)return;
    this.cancelActiveQuery$.next();const generation=++this.queryGeneration;
    this.error.set(null);this.refreshOrigin.set(automatic?'automatic':'manual');this.stale.set(!!this.lastUpdated());this.loading.set(!isRefresh);this.refreshing.set(isRefresh);
    let time_range:{start:string;end:string};try{time_range=resolveAnalyticsTimeRange(this.timeRangePreset(),this.customStart()||undefined,this.customEnd()||undefined);}catch(e){this.error.set(e instanceof Error?e.message:'Invalid range.');this.loading.set(false);this.refreshing.set(false);this.autoLoop.settled(false);return;}
    const body={projects:[workspace.projectId],time_range,interval:this.interval(),top_n:this.topN(),...(this.correlationId()?{correlation_id:this.correlationId()}:{}),...(this.selectedService()?{services:[this.selectedService()]}:{}),...(this.selectedEnvironment()?{environments:[this.selectedEnvironment()]}:{}),...(this.selectedLevels().length?{levels:this.selectedLevels()}: {})};
    this.dashboardApi.query(body).pipe(takeUntil(this.cancelActiveQuery$),takeUntil(this.destroy$)).subscribe({next:d=>{
      if(generation!==this.queryGeneration)return;this.dashboard.set(d);this.loading.set(false);this.refreshing.set(false);
      if(!d.current.metrics){this.resetDashboardData();this.error.set('Current archive data is unavailable. No counts are displayed. Retry manually.');this.autoLoop.settled(false);return;}
      const response={aggregations:d.current.aggregations,statistics:d.current.statistics,scope:d.scope};
      this.kpis.set(AnalyticsMapper.mapKpis(response));this.volumeTrend.set(AnalyticsMapper.mapTimeSeries(response));
      this.errorTrend.set(AnalyticsMapper.mapTimeSeries({...response,aggregations:{volume_over_time:response.aggregations.error_over_time}}));
      this.warningTrend.set(AnalyticsMapper.mapTimeSeries({...response,aggregations:{volume_over_time:response.aggregations.warning_over_time}}));
      this.severityDistribution.set(AnalyticsMapper.mapDistribution(response.aggregations.severity_distribution,'severity'));this.serviceDistribution.set(AnalyticsMapper.mapDistribution(response.aggregations.top_services,undefined,d.current.metrics.total));this.environmentDistribution.set(AnalyticsMapper.mapDistribution(response.aggregations.environment_distribution));
      this.partialResult.set(d.current.completeness!=='COMPLETE'||!d.comparison.complete||!d.serviceTrends.complete);
      this.appliedScope.set({project:workspace.projectId,tenant:workspace.tenantId,...time_range,intervalMs:d.intervalMs,environments:body.environments??[],services:body.services??[],correlationId:body.correlation_id??'',levels:body.levels??[]});
      this.lastUpdated.set(d.generatedAt);this.stale.set(false);this.refreshStopped.set(false);this.autoLoop.settled(true);
    },error:(err:any)=>{if(generation!==this.queryGeneration)return;this.loading.set(false);this.refreshing.set(false);this.stale.set(!!this.lastUpdated());
      const status=err?.status;if(status===401||status===403){this.setAutoRefresh(0);this.refreshStopped.set(true);this.resetDashboardData();this.dashboard.set(null);this.error.set('Analytics access expired or was revoked. Refresh your session and project access.');}
      else this.error.set((automatic?'Automatic refresh failed. ':'Manual refresh failed. ')+(status===503||status===504?'Query service is unavailable. ':'')+(this.stale()?'Displayed data is stale. Retry manually.':'Retry manually.'));
      this.autoLoop.settled(false);
    }});
  }

  private resetDashboardData():void{
    this.kpis.set(INITIAL_KPIS);this.volumeTrend.set([]);this.errorTrend.set([]);this.warningTrend.set([]);this.severityDistribution.set([]);this.serviceDistribution.set([]);this.environmentDistribution.set([]);this.appliedScope.set(null);this.partialResult.set(false);this.lastUpdated.set(null);
  }

  public setTimeRange(preset: TimeRangePreset, customStart?: string, customEnd?: string): void {
    this.timeRangePreset.set(preset);
    if (customStart !== undefined) this.customStart.set(customStart);
    if (customEnd !== undefined) this.customEnd.set(customEnd);
    const duration=Date.parse(customEnd??'')-Date.parse(customStart??'');
    const choices:BucketInterval[]=['1m','5m','15m','1h','6h','1d'];
    this.interval.set(preset==='custom'&&duration>0?(choices.find(i=>Math.ceil(duration/INTERVAL_WIDTHS[i])+1<=120)??'1d'):getDefaultIntervalForRange(preset));
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
    environments?: string[];
  }): void {
    const selected=this.appliedScope()?.levels??[];if(options.levels?.length&&selected.length){const intersection=options.levels.filter(l=>selected.includes(l));if(!intersection.length)return;options={...options,levels:intersection};}
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

    const applied=this.appliedScope();
    if(applied){if(applied.correlationId)queryParams['correlation']=applied.correlationId;if(!options.levels?.length&&applied.levels?.length)queryParams['levels']=applied.levels.join(',');const range=options.timeRange??applied;queryParams['project']=applied.project;queryParams['range']='custom';queryParams['start']=range.start;queryParams['end']=range.end;const envs=options.environments??applied.environments;if(envs.length)queryParams['environments']=envs.join(',');if(!options.services?.length&&applied.services.length)queryParams['services']=applied.services.join(',');}
    this.router?.navigate(['/logs'], { queryParams });
  }
}
