import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';
import { WorkspaceContextService } from '../../core/workspace/workspace-context.service';
import { AnalyticsFacade } from './application/analytics.facade';
import { MetricCardComponent } from './components/metric-card/metric-card.component';
import { TimeSeriesChartComponent } from './components/time-series-chart/time-series-chart.component';
import { SeverityChartComponent } from './components/severity-chart/severity-chart.component';
import { ServiceDistributionComponent } from './components/service-distribution/service-distribution.component';
import { ErrorBreakdownComponent } from './components/error-breakdown/error-breakdown.component';
import { AnalyticsToolbarComponent } from './components/analytics-toolbar/analytics-toolbar.component';
import { TimeRangePreset } from '../log-explorer/domain/log-search.model';
import {
  BucketInterval,
  AnalyticsDimension,
  TimeSeriesPoint,
} from './domain/analytics-metric.model';

@Component({
  selector: 'skyra-analytics',
  standalone: true,
  imports: [
    CommonModule,
    PageHeaderComponent,
    MetricCardComponent,
    TimeSeriesChartComponent,
    SeverityChartComponent,
    ServiceDistributionComponent,
    ErrorBreakdownComponent,
    AnalyticsToolbarComponent,
  ],
  providers: [AnalyticsFacade],
  templateUrl: './analytics.component.html',
  styleUrl: './analytics.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnalyticsComponent implements OnInit {
  private readonly facade = inject(AnalyticsFacade);
  private readonly workspaceContext = inject(WorkspaceContextService);

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

  ngOnInit(): void {
    this.facade.loadAnalytics();
  }

  onTimeRangeChange(val: TimeRangePreset): void {
    this.facade.setTimeRange(val);
    this.facade.loadAnalytics();
  }

  onIntervalChange(val: BucketInterval): void {
    this.facade.setInterval(val);
    this.facade.loadAnalytics();
  }

  onEnvironmentChange(env: string): void {
    this.facade.setEnvironment(env);
    this.facade.loadAnalytics();
  }

  onDimensionSelect(dim: AnalyticsDimension): void {
    this.facade.setDimension(dim);
  }

  onRefresh(): void {
    this.facade.loadAnalytics(true);
  }

  onCustomRangeApply(range: { start: string; end: string }): void {
    this.facade.setTimeRange('custom', range.start, range.end);
    this.facade.loadAnalytics();
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

  onBucketSelect(point: TimeSeriesPoint): void {
    const start = point.timestamp;
    const startDate = new Date(start);
    // Interval window in ms
    let windowMs = 5 * 60 * 1000;
    switch (this.interval()) {
      case '1m': windowMs = 60 * 1000; break;
      case '5m': windowMs = 5 * 60 * 1000; break;
      case '15m': windowMs = 15 * 60 * 1000; break;
      case '1h': windowMs = 60 * 60 * 1000; break;
      case '6h': windowMs = 6 * 60 * 60 * 1000; break;
      case '1d': windowMs = 24 * 60 * 60 * 1000; break;
    }
    const endDate = new Date(startDate.getTime() + windowMs);

    this.facade.navigateToLogs({
      timeRange: {
        start,
        end: endDate.toISOString(),
      },
    });
  }
}
