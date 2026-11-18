import {computed,DestroyRef} from '@angular/core';
import {firstValueFrom,skip} from 'rxjs';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {DashboardApi,DashboardPreference,DashboardSettings} from './application/dashboard-api.service';
import {AppConfigService} from '../../core/config/app-config.service';
import { ChangeDetectionStrategy, Component, inject, OnInit, effect, untracked, signal, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';
import { WorkspaceContextService } from '../../core/workspace/workspace-context.service';
import { AnalyticsFacade } from './application/analytics.facade';
import { MetricCardComponent } from './components/metric-card/metric-card.component';
import { TimeSeriesChartComponent } from './components/time-series-chart/time-series-chart.component';
import { SeverityChartComponent } from './components/severity-chart/severity-chart.component';
import { ServiceDistributionComponent } from './components/service-distribution/service-distribution.component';
import { AnalyticsToolbarComponent } from './components/analytics-toolbar/analytics-toolbar.component';
import {ActivatedRoute,Router} from '@angular/router';
import { TimeRangePreset } from '../log-explorer/domain/log-search.model';
import {
  BucketInterval,
  AnalyticsDimension,
  TimeSeriesPoint,
} from './domain/analytics-metric.model';

@Component({
  selector: 'skyra-analytics',
  schemas:[CUSTOM_ELEMENTS_SCHEMA],
  standalone: true,
  imports: [
    CommonModule,
    PageHeaderComponent,
    MetricCardComponent,
    TimeSeriesChartComponent,
    SeverityChartComponent,
    ServiceDistributionComponent,
    AnalyticsToolbarComponent,
  ],
  providers: [AnalyticsFacade],
  templateUrl: './analytics.component.html',
  styleUrl: './analytics.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnalyticsComponent implements OnInit {
  readonly facade = inject(AnalyticsFacade);
  private readonly dashboardApi=inject(DashboardApi);private readonly appConfig=inject(AppConfigService);private readonly destroy=inject(DestroyRef);
  readonly advanced=computed(()=>this.appConfig.config().advancedAnalytics===true);
  readonly dashboard=this.facade.dashboard;readonly stale=this.facade.stale;readonly autoRefresh=this.facade.autoRefreshSeconds;
  readonly preference=signal<DashboardPreference|null>(null);readonly preferenceBusy=signal(false);readonly preferenceMessage=signal('');private preferenceGeneration=0;private writingUrl=false;private contextTransition=false;private disposed=false;
  readonly correlation=signal('');readonly service=signal('');readonly topN=this.facade.topN;readonly trendMetric=this.facade.trendMetric;
  private load(refresh=false){if(this.disposed)return;if(this.advanced())this.facade.loadDashboard(refresh);else this.facade.loadAnalytics(refresh);}
  private applySettings(settings:DashboardSettings){this.facade.setTimeRange(settings.range as TimeRangePreset);this.facade.setInterval(settings.interval as BucketInterval);this.facade.setService(settings.service);this.service.set(settings.service);this.facade.topN.set(settings.topN);this.facade.trendMetric.set(settings.metric);this.facade.setAutoRefresh(settings.refreshSeconds);}
  async restorePreferences(reload=true){const generation=++this.preferenceGeneration,project=this.context().projectId;this.preferenceBusy.set(true);try{const pref=await firstValueFrom(this.dashboardApi.read(project).pipe(takeUntilDestroyed(this.destroy)));if(generation!==this.preferenceGeneration||project!==this.context().projectId)return;this.preference.set(pref);this.applySettings(pref.settings);this.preferenceMessage.set('Presentation preferences restored.');if(reload){this.load();this.updateUrl();}}catch{if(generation===this.preferenceGeneration){this.preference.set(null);this.preferenceMessage.set('Preferences unavailable. Manual analytics remains available. Reload before saving.');}}finally{if(generation===this.preferenceGeneration)this.preferenceBusy.set(false);}}
  async savePreferences(reset=false){const pref=this.preference();if(!pref||this.preferenceBusy())return;const generation=this.preferenceGeneration,project=this.context().projectId;this.preferenceBusy.set(true);try{const settings={v:1,range:this.timeRange()==='custom'?'1h':this.timeRange(),refreshSeconds:this.autoRefresh(),service:this.service(),interval:this.interval(),topN:this.topN(),metric:this.trendMetric()};const result=await firstValueFrom((reset?this.dashboardApi.reset(project,pref.version):this.dashboardApi.save(project,settings,pref.version)).pipe(takeUntilDestroyed(this.destroy)));if(generation!==this.preferenceGeneration||project!==this.context().projectId)return;this.preference.set(result);if(reset){this.applySettings(result.settings);this.load();this.updateUrl();}this.preferenceMessage.set(reset?'Preferences reset to defaults.':'Presentation preferences saved. Correlation and custom UTC bounds are not stored.');}catch(e:any){if(generation===this.preferenceGeneration)this.preferenceMessage.set(e?.status===409?'Preferences changed in another session. Restore before saving again.':'Could not save preferences. Check values and current access.');}finally{if(generation===this.preferenceGeneration)this.preferenceBusy.set(false);}}
  onAutoRefresh(seconds:number){this.facade.setAutoRefresh(seconds);}
  applyAdvancedFilters(){this.facade.correlationId.set(this.correlation());this.facade.setService(this.service());this.load();this.updateUrl();}
  clearAdvancedFilters(){this.correlation.set('');this.service.set('');this.facade.correlationId.set('');this.facade.selectedService.set('');this.facade.selectedEnvironment.set('');this.facade.selectedLevels.set([]);this.load();this.updateUrl();}
  serviceSummary(service:any){const counts=service.buckets.reduce((a:any,b:any)=>({events:a.events+b.count,errors:a.errors+b.errors,warnings:a.warnings+b.warnings}),{events:0,errors:0,warnings:0});return {...counts,errorRate:counts.events?counts.errors/counts.events*100:0};}
  servicePoints(service:any):TimeSeriesPoint[]{return service.buckets.map((b:any)=>({timestamp:b.timestamp,count:this.trendMetric()==='errors'?b.errors:this.trendMetric()==='warnings'?b.warnings:b.count,formattedTime:new Date(b.timestamp).toISOString().slice(11,16),formattedDate:b.timestamp.slice(0,10)}));}
  onServiceBucket(service:string,point:TimeSeriesPoint){const scope=this.applied();if(!scope)return;const start=new Date(Math.max(Date.parse(scope.start),Date.parse(point.timestamp))).toISOString(),end=new Date(Math.min(Date.parse(scope.end),Date.parse(point.timestamp)+scope.intervalMs)).toISOString();this.facade.navigateToLogs({services:[service],timeRange:{start,end},...(this.trendMetric()==='errors'?{levels:['error','fatal']}:this.trendMetric()==='warnings'?{levels:['warn']}:{})});}
  changeText(change:any,rate=false,unit='events'):string {if(!change)return 'Comparison incomplete';if(rate)return (change.percentagePoints>=0?'+':'')+change.percentagePoints.toFixed(2)+' percentage points';if(change.activity==='NEW')return 'New activity; no previous activity';if(change.activity==='NONE')return 'No activity in either period';return (change.absolute>=0?'+':'')+change.absolute+' '+unit+' ('+(change.percent>=0?'+':'')+change.percent.toFixed(1)+'%)';}
  private updateUrl(){if(this.disposed||!this.advanced())return;this.writingUrl=true;void this.router.navigate([],{relativeTo:this.route,queryParams:{project:this.context().projectId,range:this.timeRange(),start:this.timeRange()==='custom'?this.customStart():null,end:this.timeRange()==='custom'?this.customEnd():null,correlation:this.correlation()||null,service:this.service()||null,environment:this.environment()||null,levels:this.facade.selectedLevels().join(',')||null,interval:this.interval()},replaceUrl:false}).finally(()=>this.writingUrl=false);}
  private applyParams(p:import('@angular/router').ParamMap){
    const defaults=this.preference()?.settings;
    if(p.get('start')&&p.get('end'))this.facade.setTimeRange('custom',p.get('start')!,p.get('end')!);
    else this.facade.setTimeRange((['15m','1h','6h','24h','7d'].includes(p.get('range')??'')?p.get('range'):defaults?.range??'1h') as TimeRangePreset);
    this.facade.setInterval((['1m','5m','15m','1h','6h','1d'].includes(p.get('interval')??'')?p.get('interval'):defaults?.interval??'5m') as BucketInterval);
    this.correlation.set(p.get('correlation')??'');this.facade.correlationId.set(this.correlation());this.service.set(p.get('service')??defaults?.service??'');this.facade.setService(this.service());this.facade.setEnvironment(p.get('environment')??'');this.facade.selectedLevels.set((p.get('levels')??'').split(',').filter(Boolean));
  }
  private clearContextFilters(){this.correlation.set('');this.service.set('');this.facade.correlationId.set('');this.facade.setService('');this.facade.setEnvironment('');this.facade.selectedLevels.set([]);this.facade.setTimeRange('1h');this.facade.setAutoRefresh(0);}
  private readonly router=inject(Router);

  private readonly workspaceContext = inject(WorkspaceContextService);

  private readonly route=inject(ActivatedRoute);
  private readonly ready=signal(false);
  private workspaceKey='';
  readonly projects=this.workspaceContext.availableProjects;
  readonly applied=this.facade.appliedScope;
  readonly partial=this.facade.partialResult;
  readonly errorTrend=this.facade.errorTrend;
  readonly warningTrend=this.facade.warningTrend;
  readonly environments=this.facade.environmentDistribution;
  readonly context = this.workspaceContext.currentContext;

  readonly kpis = this.facade.kpis;
  readonly volumeTrend = this.facade.volumeTrend;
  readonly severityDistribution = this.facade.severityDistribution;
  readonly serviceDistribution = this.facade.serviceDistribution;
  readonly errorBreakdown = this.facade.errorBreakdown;
  readonly eventActionBreakdown = this.facade.eventActionBreakdown;
  readonly loading = this.facade.loading;
  readonly refreshing = this.facade.refreshing;
  readonly error = this.facade.error;
  readonly errorCorrelationId = this.facade.errorCorrelationId;
  readonly lastUpdated = this.facade.lastUpdated;
  readonly customStart=this.facade.customStart;
  readonly customEnd=this.facade.customEnd;
  readonly timeRange = this.facade.timeRangePreset;
  readonly interval = this.facade.interval;
  readonly environment = this.facade.selectedEnvironment;
  readonly selectedDimension = this.facade.selectedDimension;

  readonly dimensions: { label: string; value: AnalyticsDimension }[] = [
    { label: 'service.name', value: 'service.name' },
    { label: 'log.level', value: 'log.level' },
    { label: 'error.type', value: 'error.type' },
    { label: 'event.action', value: 'event.action' },
    { label: 'environment', value: 'service.environment' },
  ];

  constructor(){effect(()=>{const ctx=this.context(),ready=this.ready(),key=ctx.tenantId+'/'+ctx.projectId;if(ready&&key!==this.workspaceKey&&!this.contextTransition){this.workspaceKey=key;untracked(()=>{this.facade.resetState();this.clearContextFilters();this.preference.set(null);if(this.advanced())void this.restorePreferences(false).then(()=>{if(key===this.workspaceKey){this.load();this.updateUrl();}});else this.load();});}});this.destroy.onDestroy(()=>{this.disposed=true;this.preferenceGeneration++;});}
  async ngOnInit():Promise<void>{
    await this.workspaceContext.loadWorkspacesFromBff();if(this.disposed)return;const p=this.route.snapshot.queryParamMap;
    if(p.get('project')&&p.get('project')!==this.context().projectId&&!await this.workspaceContext.switchWorkspace(this.context().tenantId,p.get('project')!)){this.workspaceKey=this.context().tenantId+'/'+this.context().projectId;this.ready.set(true);this.facade.error.set('Requested analytics project is not authorized. Select an accessible project.');return;}
    if(this.advanced()){await this.restorePreferences(false);if(this.disposed)return;this.applyParams(p);this.facade.startRefresh();this.route.queryParamMap.pipe(skip(1),takeUntilDestroyed(this.destroy)).subscribe(async params=>{
      if(this.writingUrl)return;const project=params.get('project');this.contextTransition=true;
      try{if(project&&project!==this.context().projectId){this.facade.resetState();this.clearContextFilters();if(!await this.workspaceContext.switchWorkspace(this.context().tenantId,project)){this.facade.error.set('Requested analytics project is not authorized.');return;}await this.workspaceContext.loadWorkspacesFromBff();await this.restorePreferences(false);}this.workspaceKey=this.context().tenantId+'/'+this.context().projectId;this.applyParams(params);this.load();}finally{this.contextTransition=false;}
    });}
    else if(p.get('start')&&p.get('end'))this.facade.setTimeRange('custom',p.get('start')!,p.get('end')!);
    this.workspaceKey=this.context().tenantId+'/'+this.context().projectId;this.ready.set(true);this.load();
  }
  async onProjectChange(id:string):Promise<void>{
    this.contextTransition=true;this.facade.resetState();if(this.advanced())this.clearContextFilters();
    try{if(!await this.workspaceContext.switchWorkspace(this.context().tenantId,id)){this.facade.error.set('Requested analytics project is not authorized.');return;}await this.workspaceContext.loadWorkspacesFromBff();this.workspaceKey=this.context().tenantId+'/'+this.context().projectId;if(this.advanced())await this.restorePreferences(false);this.load();this.updateUrl();}finally{this.contextTransition=false;}
  }
  onExploreEnvironment(env:string):void{this.facade.navigateToLogs({environments:[env]});}

  onTimeRangeChange(val: TimeRangePreset): void {
    this.facade.setTimeRange(val);
    this.load();this.updateUrl();
  }

  onIntervalChange(val: BucketInterval): void {
    this.facade.setInterval(val);
    this.load();this.updateUrl();
  }

  onEnvironmentChange(env: string): void {
    this.facade.setEnvironment(env);
    this.load();this.updateUrl();
  }

  onDimensionSelect(dim: AnalyticsDimension): void {
    this.facade.setDimension(dim);
  }

  onRefresh(): void {
    this.load(true);
  }

  onCustomRangeApply(range: { start: string; end: string }): void {
    this.facade.setTimeRange('custom', range.start, range.end);
    this.load();this.updateUrl();
  }

  // Drilldown actions into Log Explorer
  onExploreAllLogs(): void {
    this.facade.navigateToLogs({});
  }

  onExploreErrors(): void {
    this.facade.navigateToLogs({ levels: ['error', 'fatal'] });
  }

  onExploreWarnings(): void {
    this.facade.navigateToLogs({ levels: ['warn'] });
  }

  onExploreLevel(level: string): void {
    this.facade.navigateToLogs({ levels: [level] });
  }

  onExploreService(serviceName: string): void {
    this.facade.navigateToLogs({ services: [serviceName] });
  }

  onExploreErrorType(errorType: string): void {
    // If errorType is a specific class, drill down with levels: error,fatal
    this.facade.navigateToLogs({ levels: ['error', 'fatal'] });
  }

  onBucketSelect(point:TimeSeriesPoint,levels?:string[]):void{const scope=this.applied();if(!scope)return;const start=new Date(Math.max(Date.parse(point.timestamp),Date.parse(scope.start))).toISOString(),end=new Date(Math.min(Date.parse(point.timestamp)+scope.intervalMs,Date.parse(scope.end))).toISOString();this.facade.navigateToLogs({levels,timeRange:{start,end}});}
}
