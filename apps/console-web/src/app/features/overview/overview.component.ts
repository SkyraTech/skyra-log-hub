import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';
import { WorkspaceContextService } from '../../core/workspace/workspace-context.service';
import { AnalyticsFacade } from '../analytics/application/analytics.facade';
import { MetricCardComponent } from '../analytics/components/metric-card/metric-card.component';
import { TimeSeriesChartComponent } from '../analytics/components/time-series-chart/time-series-chart.component';
import { SeverityChartComponent } from '../analytics/components/severity-chart/severity-chart.component';
import { ServiceDistributionComponent } from '../analytics/components/service-distribution/service-distribution.component';
import { AnalyticsToolbarComponent } from '../analytics/components/analytics-toolbar/analytics-toolbar.component';
import { TimeRangePreset } from '../log-explorer/domain/log-search.model';
import { TimeSeriesPoint } from '../analytics/domain/analytics-metric.model';

@Component({
  selector: 'skyra-overview',
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
  templateUrl: './overview.component.html',
  styleUrl: './overview.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OverviewComponent implements OnInit {
  private readonly facade = inject(AnalyticsFacade);
  private readonly workspaceContext = inject(WorkspaceContextService);

  readonly context = this.workspaceContext.currentContext;

  // Facade state bindings
  readonly kpis = this.facade.kpis;
  readonly volumeTrend = this.facade.volumeTrend;
  readonly severityDistribution = this.facade.severityDistribution;
  readonly serviceDistribution = this.facade.serviceDistribution;
  readonly loading = this.facade.loading;
  readonly refreshing = this.facade.refreshing;
  readonly error = this.facade.error;
  readonly errorCorrelationId = this.facade.errorCorrelationId;
  readonly lastUpdated = this.facade.lastUpdated;
  readonly timeRange = this.facade.timeRangePreset;
  readonly environment = this.facade.selectedEnvironment;

  ngOnInit(): void {
    this.facade.loadOverview();
  }

  onTimeRangeChange(val: TimeRangePreset): void {
    this.facade.setTimeRange(val);
    this.facade.loadOverview();
  }

  onEnvironmentChange(env: string): void {
    this.facade.setEnvironment(env);
    this.facade.loadOverview();
  }

  onRefresh(): void {
    this.facade.loadOverview(true);
  }

  onCustomRangeApply(range: { start: string; end: string }): void {
    this.facade.setTimeRange('custom', range.start, range.end);
    this.facade.loadOverview();
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

  onBucketSelect(point: TimeSeriesPoint): void {
    const start = point.timestamp;
    const startDate = new Date(start);
    // 5-minute or 1-hour window default
    const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
    this.facade.navigateToLogs({
      timeRange: {
        start,
        end: endDate.toISOString(),
      },
    });
  }
}
