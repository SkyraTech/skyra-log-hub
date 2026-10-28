import { TimeRangePreset } from '../../log-explorer/domain/log-search.model';

export type BucketInterval = '1m' | '5m' | '15m' | '1h' | '6h' | '1d';

export type AnalyticsDimension =
  | 'service.name'
  | 'log.level'
  | 'event.action'
  | 'error.type'
  | 'service.environment';

export interface OverviewKpiData {
  totalLogs: number;
  errorCount: number;
  errorRatePercent: number;
  warningCount: number;
  activeServicesCount: number;
  executionTimeMs: number;
  scannedBytes: number;
  scannedSegments: number;
  archiveWatermark?: string;
}

export interface TimeSeriesPoint {
  timestamp: string; // ISO 8601 UTC
  count: number;
  formattedTime: string;
  formattedDate: string;
}

export interface DistributionItem {
  key: string;
  label: string;
  count: number;
  percentage: number;
  color?: string;
}

export interface ResolvedTimeRange {
  start: string;
  end: string;
}

export function resolveAnalyticsTimeRange(
  preset: TimeRangePreset,
  customStart?: string,
  customEnd?: string,
  now: Date = new Date(),
): ResolvedTimeRange {
  if (preset === 'custom' && customStart && customEnd) {
    return { start: customStart, end: customEnd };
  }

  const end = now.toISOString();
  let msAgo = 15 * 60 * 1000; // default 15m

  switch (preset) {
    case '15m':
      msAgo = 15 * 60 * 1000;
      break;
    case '1h':
      msAgo = 60 * 60 * 1000;
      break;
    case '6h':
      msAgo = 6 * 60 * 60 * 1000;
      break;
    case '24h':
      msAgo = 24 * 60 * 60 * 1000;
      break;
    case '7d':
      msAgo = 7 * 24 * 60 * 60 * 1000;
      break;
    default:
      msAgo = 60 * 60 * 1000; // default 1h
  }

  const start = new Date(now.getTime() - msAgo).toISOString();
  return { start, end };
}

export function getDefaultIntervalForRange(preset: TimeRangePreset): BucketInterval {
  switch (preset) {
    case '15m':
      return '1m';
    case '1h':
      return '5m';
    case '6h':
      return '15m';
    case '24h':
      return '1h';
    case '7d':
      return '6h';
    default:
      return '1h';
  }
}
