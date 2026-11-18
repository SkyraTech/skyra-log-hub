import {computed,effect,untracked,DestroyRef} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {firstValueFrom,skip,Subscription} from 'rxjs';
import type {ParamMap} from '@angular/router';
import {AdvancedExplorerApi,SavedSearch,SavedFilters} from './advanced-explorer-api.service';
import {AppConfigService} from '../../core/config/app-config.service';
import {
  ChangeDetectionStrategy,
  CUSTOM_ELEMENTS_SCHEMA,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';
import { LogTableComponent } from '../../shared/ui/log-table/log-table.component';
import { TableDensity } from '../../shared/ui/log-table/log-table.model';
import { SearchToolbarComponent } from './components/search-toolbar/search-toolbar.component';
import { FilterPanelComponent } from './components/filter-panel/filter-panel.component';
import { QueryStatusComponent } from './components/query-status/query-status.component';
import { LogEventDrawerComponent } from './components/log-event-drawer/log-event-drawer.component';
import { LogExplorerFacade } from './application/log-explorer.facade';
import { FilterStateService } from './application/filter-state.service';
import { CursorHistoryService } from './application/cursor-history.service';
import { WorkspaceContextService } from '../../core/workspace/workspace-context.service';
import { LogExplorerRow } from './domain/log-event.model';
import { FilterChip } from './domain/log-filter.model';
import { TimeRangePreset } from './domain/log-search.model';

@Component({
  selector: 'skyra-log-explorer',
  schemas:[CUSTOM_ELEMENTS_SCHEMA],
  standalone: true,
  imports: [
    CommonModule,
    PageHeaderComponent,
    LogTableComponent,
    SearchToolbarComponent,
    FilterPanelComponent,
    QueryStatusComponent,
    LogEventDrawerComponent,
  ],
  providers: [
    LogExplorerFacade,
    FilterStateService,
    CursorHistoryService,
  ],
  templateUrl: './log-explorer.component.html',
  styleUrl: './log-explorer.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LogExplorerComponent implements OnInit {
  private readonly facade = inject(LogExplorerFacade);
  readonly filterService = inject(FilterStateService);
  private readonly workspaceContext = inject(WorkspaceContextService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly context = this.workspaceContext.currentContext;

  // Facade state bindings
  readonly rows = this.facade.rows;
  readonly loading = this.facade.loading;
  readonly error = this.facade.error;
  readonly errorCorrelationId = this.facade.errorCorrelationId;
  readonly statistics = this.facade.statistics;
  readonly scope = this.facade.scope;
  readonly facets = this.facade.facets;
  readonly pagination = this.facade.cursorHistory.state;
  readonly selectedRow = this.facade.selectedRow;
  readonly detailLoading = this.facade.detailLoading;
  readonly detailError = this.facade.detailError;

  // Filter service bindings
  readonly queryText = this.filterService.queryText;
  readonly timeRange = this.filterService.timeRangePreset;
  readonly selectedLevels = this.filterService.selectedLevels;
  readonly selectedServices = this.filterService.selectedServices;
  readonly selectedEnvironments = this.filterService.selectedEnvironments;
  readonly filterChips = this.filterService.filterChips;

  readonly tableDensity = signal<TableDensity>('compact');

  private readonly advancedApi=inject(AdvancedExplorerApi);
  private readonly appConfig=inject(AppConfigService);
  private readonly destroy=inject(DestroyRef);
  readonly advancedEnabled=computed(()=>this.appConfig.config().advancedExplorer===true);
  readonly savedItems=signal<SavedSearch[]>([]);readonly savedNext=signal<string|null>(null);readonly canShare=signal(false);
  readonly selectedSaved=signal<SavedSearch|null>(null);readonly savedName=signal('');readonly savedDescription=signal('');readonly savedVisibility=signal<'PRIVATE'|'PROJECT'>('PRIVATE');
  readonly advancedBusy=signal(false);readonly advancedMessage=signal('');readonly advancedError=signal('');readonly exportBusy=signal(false);readonly exportFormat=signal<'json'|'csv'>('json');readonly exportScope=signal<'matching'|'page'>('matching');
  private savedGeneration=0;private restoreGeneration=0;private exportGeneration=0;private writingUrl=false;private exportRequest?:Subscription;
  constructor(){let previous='';effect(()=>{const scope=this.context().tenantId+'/'+this.context().projectId,enabled=this.advancedEnabled();if(scope!==previous||!enabled){previous=scope;untracked(()=>{this.cancelExport();this.savedGeneration++;this.savedItems.set([]);this.savedNext.set(null);this.selectedSaved.set(null);this.savedName.set('');this.savedDescription.set('');this.savedVisibility.set('PRIVATE');this.canShare.set(false);this.advancedError.set('');if(enabled&&this.context().projectId)void this.reloadSaved();});}});this.destroy.onDestroy(()=>{this.savedGeneration++;this.restoreGeneration++;this.cancelExport();});}
  async ngOnInit(): Promise<void> {
    await this.workspaceContext.loadWorkspacesFromBff();
    await this.restoreUrl(this.route.snapshot.queryParamMap);
    this.route.queryParamMap.pipe(skip(1),takeUntilDestroyed(this.destroy)).subscribe(params=>{if(!this.writingUrl)void this.restoreUrl(params);});
  }
  private async restoreUrl(params:ParamMap):Promise<void>{
    const generation=++this.restoreGeneration;
    this.filterService.clearAllFilters();

    await this.workspaceContext.loadWorkspacesFromBff();
    // 1. Process URL query parameters for deep linking

    const requestedProject=params.get('project');if(requestedProject&&requestedProject!==this.context().projectId){const ok=await this.workspaceContext.switchWorkspace(this.context().tenantId,requestedProject);await this.workspaceContext.loadWorkspacesFromBff();if(!ok){this.facade.rows.set([]);this.facade.error.set('Requested project is not accessible. Select an authorized project.');return;}}
    const q = params.get('q');
    const range = params.get('range');
    const start = params.get('start');
    const end = params.get('end');
    const levels = params.get('levels');
    const services = params.get('services');
    const environments=params.get('environments'),trace=params.get('trace'),limit=params.get('limit');
    if(trace)this.filterService.setTraceId(trace);
    if(environments)for(const env of environments.split(',').filter(Boolean))this.filterService.toggleEnvironment(env);
    if(limit&&['25','50','100','200'].includes(limit))this.facade.cursorHistory.setPageSize(+limit);
    const eventId = params.get('eventId');
    this.filterService.correlationId.set(params.get('correlation')??'');

    if (q) this.filterService.setQueryText(q);
    if (range && ['15m', '1h', '6h', '24h', '7d', 'custom'].includes(range)) {
      this.filterService.setTimeRange(range as TimeRangePreset, start || undefined, end || undefined);
    }
    if (levels) {
      this.filterService.setLevels(levels.split(',').filter(Boolean));
    }
    if (services) {
      for (const s of services.split(',').filter(Boolean)) {
        this.filterService.toggleService(s);
      }
    }

    const savedId=params.get('search');if(savedId&&this.advancedEnabled()){try{const row=await firstValueFrom(this.advancedApi.read(this.context().projectId,savedId).pipe(takeUntilDestroyed(this.destroy)));if(generation!==this.restoreGeneration)return;this.selectSaved(row);this.restoreFilters(row.filters);}catch{if(generation===this.restoreGeneration){this.selectedSaved.set(null);this.advancedError.set('Saved search is unavailable for this project. Manual filters remain available.');}}}
    if(generation!==this.restoreGeneration)return;
    // 2. Fetch facets and execute initial search
    this.facade.loadFacets();
    this.facade.executeSearch(true);

    // 3. If direct eventId deep-link was provided, load single event
    if (eventId) {
      this.facade.loadEventById(eventId);
    }
  }

  onInvestigateCorrelation(id:string){this.filterService.correlationId.set(id);this.closeDrawer();this.onSearch();}
  onCustomRangeChange(value:{start:string;end:string}){this.filterService.setTimeRange('custom',value.start,value.end);this.updateUrl();}
  onInvestigateTrace(trace:string){this.filterService.setTraceId(trace);this.closeDrawer();this.onSearch();}

  onQueryTextChange(val: string): void {
    this.filterService.setQueryText(val);
  }

  onTimeRangeChange(val: TimeRangePreset): void {
    this.filterService.setTimeRange(val);
    this.facade.executeSearch(true);
    this.facade.loadFacets();
    this.updateUrl();
  }

  onPageSizeChange(newSize: number): void {
    this.facade.setPageSize(newSize);
    this.updateUrl();
  }

  onSearch(): void {
    this.facade.executeSearch(true);
    this.updateUrl();
  }

  onCancel(): void {
    this.facade.cancelSearch();
  }

  onLevelToggle(level: string): void {
    this.filterService.toggleLevel(level);
    this.facade.executeSearch(true);
    this.updateUrl();
  }

  onServiceToggle(srv: string): void {
    this.filterService.toggleService(srv);
    this.facade.executeSearch(true);
    this.updateUrl();
  }

  onEnvToggle(env: string): void {
    this.filterService.toggleEnvironment(env);
    this.facade.executeSearch(true);
    this.updateUrl();
  }

  onChipRemove(chip: FilterChip): void {
    this.filterService.removeChip(chip);
    this.facade.executeSearch(true);
    this.updateUrl();
  }

  onClearAll(): void {
    this.filterService.clearAllFilters();
    this.facade.executeSearch(true);
    this.facade.loadFacets();
    this.updateUrl();
  }

  onRefreshFacets(): void {
    this.facade.loadFacets();
  }

  onPrevPage(): void {
    this.facade.prevPage();
  }

  onNextPage(): void {
    this.facade.nextPage();
  }

  exportPage(){this.exportResults('json','page');}
  private returnFocus?:HTMLElement;
  onRowSelect(row: LogExplorerRow | any): void {
    this.returnFocus=document.activeElement instanceof HTMLElement?document.activeElement:undefined;
    this.facade.selectRow(row as LogExplorerRow);
  }

  onDensityChange(d: TableDensity): void {
    this.tableDensity.set(d);
  }

  closeDrawer(): void {
    this.facade.closeDrawer();
    setTimeout(()=>{if(this.returnFocus?.isConnected)this.returnFocus.focus();},0);
  }

  private selectSaved(row:SavedSearch){this.selectedSaved.set(row);this.savedName.set(row.name);this.savedDescription.set(row.description);this.savedVisibility.set(row.visibility);}
  private captureFilters():SavedFilters {const preset=this.filterService.timeRangePreset();return {v:1,range:preset==='custom'?{kind:'absolute',start:new Date(this.filterService.customStart()).toISOString(),end:new Date(this.filterService.customEnd()).toISOString()}:{kind:'relative',preset},queryText:this.filterService.queryText().trim(),levels:this.filterService.selectedLevels(),services:this.filterService.selectedServices(),environments:this.filterService.selectedEnvironments(),...(this.filterService.traceId()?{traceId:this.filterService.traceId()}:{}),...(this.filterService.correlationId()?{correlationId:this.filterService.correlationId()}:{})};}
  private restoreFilters(f:SavedFilters){this.filterService.clearAllFilters();this.filterService.queryText.set(f.queryText??'');this.filterService.selectedLevels.set(f.levels??[]);this.filterService.selectedServices.set(f.services??[]);this.filterService.selectedEnvironments.set(f.environments??[]);this.filterService.traceId.set(f.traceId??'');this.filterService.correlationId.set(f.correlationId??'');if(f.range.kind==='relative')this.filterService.setTimeRange(f.range.preset);else this.filterService.setTimeRange('custom',f.range.start,f.range.end);this.facade.cursorHistory.reset();}
  async reloadSaved(more=false){if(!this.advancedEnabled())return;const generation=this.savedGeneration,project=this.context().projectId;try{const page=await firstValueFrom(this.advancedApi.list(project,more?this.savedNext()??undefined:undefined).pipe(takeUntilDestroyed(this.destroy)));if(generation!==this.savedGeneration||project!==this.context().projectId)return;this.savedItems.set(more?[...this.savedItems(),...page.items]:page.items);this.savedNext.set(page.nextCursor);this.canShare.set(page.canShare);}catch{if(generation===this.savedGeneration)this.advancedError.set('Saved searches are unavailable. Retry loading them.');}}
  async applySaved(id:string){if(!id)return;const generation=this.savedGeneration,project=this.context().projectId;this.advancedError.set('');try{const row=await firstValueFrom(this.advancedApi.read(project,id).pipe(takeUntilDestroyed(this.destroy)));if(generation!==this.savedGeneration||project!==this.context().projectId)return;this.selectSaved(row);this.restoreFilters(row.filters);this.facade.executeSearch(true);this.facade.loadFacets();this.updateUrl(row.id);this.advancedMessage.set('Saved search applied. Relative time is resolved now.');}catch{if(generation===this.savedGeneration)this.advancedError.set('Saved search cannot be applied. Check current project access or reload.');}}
  async saveSearch(update=false){if(this.advancedBusy()||!this.savedName().trim())return;const project=this.context().projectId,generation=this.savedGeneration;this.advancedBusy.set(true);this.advancedError.set('');try{const input={name:this.savedName(),description:this.savedDescription(),visibility:this.savedVisibility(),filters:this.captureFilters()},row=await firstValueFrom(this.advancedApi.save(project,input,update?this.selectedSaved()??undefined:undefined).pipe(takeUntilDestroyed(this.destroy)));if(generation!==this.savedGeneration)return;this.selectSaved(row);await this.reloadSaved();this.advancedMessage.set(update?'Saved search updated.':'Search saved.');}catch(e:any){if(generation===this.savedGeneration)this.advancedError.set(e?.status===409?'Saved search changed or name exists. Apply the latest saved search before editing again.':e?.status===403?'You cannot change this saved search or sharing scope.':'Could not save search. Check name, filters and current project access.');}finally{this.advancedBusy.set(false);}}
  async deleteSaved(){const row=this.selectedSaved();if(!row?.canEdit||this.advancedBusy()||!confirm('Delete this saved search?'))return;const generation=this.savedGeneration,project=this.context().projectId;this.advancedBusy.set(true);this.advancedError.set('');try{await firstValueFrom(this.advancedApi.remove(project,row).pipe(takeUntilDestroyed(this.destroy)));if(generation!==this.savedGeneration)return;this.selectedSaved.set(null);this.savedName.set('');await this.reloadSaved();this.updateUrl();this.advancedMessage.set('Saved search deleted. Current manual filters are retained.');}catch(e:any){if(generation===this.savedGeneration)this.advancedError.set(e?.status===409?'Saved search changed. Reload before deleting.':'Could not delete saved search. Check current permissions.');}finally{this.advancedBusy.set(false);}}
  cancelExport(){this.exportGeneration++;this.exportRequest?.unsubscribe();this.exportRequest=undefined;if(this.exportBusy())this.advancedMessage.set('Export cancelled. No new download was created.');this.exportBusy.set(false);}
  exportResults(formatOverride?:'json'|'csv',scopeOverride?:'matching'|'page'){const applied=this.facade.appliedRequest();if(!applied||this.loading()||this.exportBusy())return;const scope=scopeOverride??this.exportScope(),format=formatOverride??this.exportFormat(),search={...applied};if(scope==='matching')delete search.cursor;const generation=++this.exportGeneration,project=this.context().projectId;this.exportBusy.set(true);this.advancedError.set('');this.advancedMessage.set('Preparing a bounded export…');this.exportRequest=this.advancedApi.export(search,format,scope,scope==='page'?this.rows().map(row=>row.eventId):undefined).subscribe({next:response=>{if(generation!==this.exportGeneration||project!==this.context().projectId)return;this.exportBusy.set(false);const blob=response.body;if(!blob||blob.size>5*1024*1024){this.advancedError.set('Export was invalid or too large. No download created.');return;}const truncated=response.headers.get('X-Export-Truncated')==='true';const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='skyra-logs-'+(scope==='matching'?'matching-results':'current-page')+(truncated?'-truncated':'')+'.'+format;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);this.advancedMessage.set(truncated?'Truncated export downloaded: a server event, byte or page limit was reached. Narrow the search to export the remainder.':'Export downloaded. Matching filters and effective time bounds were fixed; results are not a global snapshot.');},error:e=>{if(generation!==this.exportGeneration)return;this.exportBusy.set(false);const message=e?.status===409?'The displayed page changed. Refresh the search before exporting.':e?.status===429?'Another export is running. Wait and retry.':e?.status===401||e?.status===403?'Export access changed. Refresh your session and project permissions.':'Export failed or was interrupted. No complete download was produced.';this.advancedError.set(message);if(!this.advancedEnabled())this.facade.error.set(message);}});}

  private updateUrl(savedId:string|null=null): void {
    const q = this.filterService.queryText().trim();
    const range = this.filterService.timeRangePreset();
    const levels = this.filterService.selectedLevels().join(',');
    const services = this.filterService.selectedServices().join(',');

    const queryParams: Record<string, string | null> = {
      q:/skyra_live_[a-f0-9]{64}|Bearer\s+|eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/i.test(q)?null:q||null,
      project:this.context().projectId||null,
      range: range !== '15m' ? range : null,
      levels: levels || null,
      services: services || null,
      environments:this.filterService.selectedEnvironments().join(',')||null,
      trace:this.filterService.traceId().trim()||null,
      start:range==='custom'?this.filterService.customStart()||null:null,
      end:range==='custom'?this.filterService.customEnd()||null:null,
      limit:String(this.pagination().pageSize),
      eventId:null,
      correlation:this.filterService.correlationId()||null,
      search:savedId,
    };

    this.writingUrl=true;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: '',
      replaceUrl: false,
    }).finally(()=>this.writingUrl=false);
  }
}
