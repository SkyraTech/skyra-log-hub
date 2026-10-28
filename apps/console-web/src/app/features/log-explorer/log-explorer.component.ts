import {
  ChangeDetectionStrategy,
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
  private readonly filterService = inject(FilterStateService);
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

  ngOnInit(): void {
    // 1. Process URL query parameters for deep linking
    const params = this.route.snapshot.queryParamMap;
    const q = params.get('q');
    const range = params.get('range');
    const levels = params.get('levels');
    const services = params.get('services');
    const eventId = params.get('eventId');

    if (q) this.filterService.setQueryText(q);
    if (range && ['15m', '1h', '6h', '24h', '7d', 'custom'].includes(range)) {
      this.filterService.setTimeRange(range as TimeRangePreset);
    }
    if (levels) {
      this.filterService.setLevels(levels.split(',').filter(Boolean));
    }
    if (services) {
      for (const s of services.split(',').filter(Boolean)) {
        this.filterService.toggleService(s);
      }
    }

    // 2. Fetch facets and execute initial search
    this.facade.loadFacets();
    this.facade.executeSearch(true);

    // 3. If direct eventId deep-link was provided, load single event
    if (eventId) {
      this.facade.loadEventById(eventId);
    }
  }

  onQueryTextChange(val: string): void {
    this.filterService.setQueryText(val);
  }

  onTimeRangeChange(val: TimeRangePreset): void {
    this.filterService.setTimeRange(val);
    this.facade.executeSearch(true);
    this.facade.loadFacets();
  }

  onPageSizeChange(newSize: number): void {
    this.facade.setPageSize(newSize);
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

  onRowSelect(row: LogExplorerRow | any): void {
    this.facade.selectRow(row as LogExplorerRow);
  }

  onDensityChange(d: TableDensity): void {
    this.tableDensity.set(d);
  }

  closeDrawer(): void {
    this.facade.closeDrawer();
  }

  private updateUrl(): void {
    const q = this.filterService.queryText().trim();
    const range = this.filterService.timeRangePreset();
    const levels = this.filterService.selectedLevels().join(',');
    const services = this.filterService.selectedServices().join(',');

    const queryParams: Record<string, string | null> = {
      q: q || null,
      range: range !== '15m' ? range : null,
      levels: levels || null,
      services: services || null,
    };

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
