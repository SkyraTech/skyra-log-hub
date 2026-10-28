import { TimeRangePreset } from '../../log-explorer/domain/log-search.model';
import {
  BucketInterval,
  AnalyticsDimension,
  OverviewKpiData,
  TimeSeriesPoint,
  DistributionItem,
} from './analytics-metric.model';

export interface AnalyticsFilterState {
  timeRangePreset: TimeRangePreset;
  customStart?: string;
  customEnd?: string;
  interval: BucketInterval;
  selectedDimension: AnalyticsDimension;
  environmentFilter?: string;
  serviceFilter?: string;
}

export interface AnalyticsDashboardState {
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  errorCorrelationId: string | null;
  kpis: OverviewKpiData;
  volumeTrend: TimeSeriesPoint[];
  severityDistribution: DistributionItem[];
  serviceDistribution: DistributionItem[];
  errorBreakdown: DistributionItem[];
  eventActionBreakdown: DistributionItem[];
  dimensionDistribution: DistributionItem[];
  lastUpdated: string | null;
}

export const INITIAL_KPIS: OverviewKpiData = {
  totalLogs: 0,
  errorCount: 0,
  errorRatePercent: 0,
  warningCount: 0,
  activeServicesCount: 0,
  executionTimeMs: 0,
  scannedBytes: 0,
  scannedSegments: 0,
};

export const INITIAL_ANALYTICS_STATE: AnalyticsDashboardState = {
  loading: false,
  refreshing: false,
  error: null,
  errorCorrelationId: null,
  kpis: INITIAL_KPIS,
  volumeTrend: [],
  severityDistribution: [],
  serviceDistribution: [],
  errorBreakdown: [],
  eventActionBreakdown: [],
  dimensionDistribution: [],
  lastUpdated: null,
};
