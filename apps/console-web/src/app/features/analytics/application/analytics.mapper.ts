import {
  AggregateLogsResponse,
  AggregationResultItem,
  AggregationBucket,
} from '../../../core/http/api-client.port';
import {
  OverviewKpiData,
  TimeSeriesPoint,
  DistributionItem,
} from '../domain/analytics-metric.model';

const SEVERITY_COLOR_MAP: Record<string, string> = {
  fatal: '#991B1B', // Dark red
  error: '#DC2626', // Red
  warn: '#D97706',  // Amber
  info: '#0A58CA',  // Skyra Platform Blue
  debug: '#475569', // Slate
  trace: '#94A3B8', // Light slate
};

export class AnalyticsMapper {
  public static mapKpis(response: AggregateLogsResponse): OverviewKpiData {
    const aggregations = response.aggregations || {};
    const stats = response.statistics;

    // 1. Calculate counts from severity distribution or volume trend
    let totalLogs = 0;
    let errorCount = 0;
    let warningCount = 0;

    const severityAgg = aggregations['severity_distribution'];
    if (severityAgg?.buckets && Array.isArray(severityAgg.buckets)) {
      for (const bucket of severityAgg.buckets) {
        const count = bucket.count || 0;
        totalLogs += count;
        const key = String(bucket.key).toLowerCase();
        if (key === 'error' || key === 'fatal') {
          errorCount += count;
        } else if (key === 'warn' || key === 'warning') {
          warningCount += count;
        }
      }
    } else {
      // Fallback: sum from volume_over_time if available
      const volumeAgg = aggregations['volume_over_time'];
      if (volumeAgg?.buckets && Array.isArray(volumeAgg.buckets)) {
        totalLogs = volumeAgg.buckets.reduce((acc, b) => acc + (b.count || 0), 0);
      }
    }

    const errorRatePercent = totalLogs > 0 ? (errorCount / totalLogs) * 100 : 0;

    // 2. Active services count from cardinality aggregation
    let activeServicesCount = 0;
    const servicesCountAgg = aggregations['active_services_count'] || aggregations['unique_services'];
    if (servicesCountAgg && typeof servicesCountAgg.value === 'number') {
      activeServicesCount = servicesCountAgg.value;
    } else {
      // Fallback: count distinct keys in top_services
      const topServicesAgg = aggregations['top_services'];
      if (topServicesAgg?.buckets) {
        activeServicesCount = topServicesAgg.buckets.length;
      }
    }

    return {
      totalLogs,
      errorCount,
      errorRatePercent: Math.round(errorRatePercent * 100) / 100, // 2 decimal places
      warningCount,
      activeServicesCount,
      executionTimeMs: stats?.execution_time_ms ?? 0,
      scannedBytes: stats?.scanned_bytes ?? 0,
      scannedSegments: stats?.scanned_segments ?? 0,
      archiveWatermark: stats?.archive_watermark,
    };
  }

  public static mapTimeSeries(response: AggregateLogsResponse): TimeSeriesPoint[] {
    const volumeAgg = response.aggregations?.['volume_over_time'];
    if (!volumeAgg?.buckets || !Array.isArray(volumeAgg.buckets)) {
      return [];
    }

    return volumeAgg.buckets.map((b: AggregationBucket) => {
      const ts = b.timestamp || String(b.key || '');
      const date = new Date(ts);
      const isDateValid = !isNaN(date.getTime());

      return {
        timestamp: ts,
        count: b.count || 0,
        formattedTime: isDateValid
          ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
          : ts,
        formattedDate: isDateValid
          ? date.toISOString().substring(0, 10)
          : ts,
      };
    });
  }

  public static mapDistribution(
    aggResult: AggregationResultItem | undefined,
    colorScheme?: 'severity' | 'monochrome',
  ): DistributionItem[] {
    if (!aggResult?.buckets || !Array.isArray(aggResult.buckets)) {
      return [];
    }

    const total = aggResult.buckets.reduce((acc, b) => acc + (b.count || 0), 0);

    return aggResult.buckets.map((b) => {
      const key = String(b.key ?? 'unknown');
      const count = b.count || 0;
      const percentage = total > 0 ? (count / total) * 100 : 0;

      let color: string | undefined;
      if (colorScheme === 'severity') {
        color = SEVERITY_COLOR_MAP[key.toLowerCase()] || '#64748B';
      }

      return {
        key,
        label: key,
        count,
        percentage: Math.round(percentage * 10) / 10,
        color,
      };
    });
  }
}
