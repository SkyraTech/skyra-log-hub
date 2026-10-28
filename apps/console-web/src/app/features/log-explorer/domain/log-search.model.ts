import { StructuredFilter } from '../../../core/http/api-client.port';

export type TimeRangePreset = '15m' | '1h' | '6h' | '24h' | '7d' | 'custom';

export interface TimeRangeBoundaries {
  start: string; // ISO 8601 strict UTC ending in Z
  end: string;   // ISO 8601 strict UTC ending in Z
}

export interface TimeRangePresetOption {
  id: TimeRangePreset;
  label: string;
  durationMs?: number;
}

export const TIME_RANGE_PRESETS: readonly TimeRangePresetOption[] = [
  { id: '15m', label: 'Last 15 minutes', durationMs: 15 * 60 * 1000 },
  { id: '1h', label: 'Last 1 hour', durationMs: 60 * 60 * 1000 },
  { id: '6h', label: 'Last 6 hours', durationMs: 6 * 60 * 60 * 1000 },
  { id: '24h', label: 'Last 24 hours', durationMs: 24 * 60 * 60 * 1000 },
  { id: '7d', label: 'Last 7 days', durationMs: 7 * 24 * 60 * 60 * 1000 },
  { id: 'custom', label: 'Custom range' },
] as const;

export function resolveTimeRange(
  preset: TimeRangePreset,
  customStart?: string,
  customEnd?: string,
  nowMs: number = Date.now(),
): TimeRangeBoundaries {
  if (preset === 'custom') {
    const start = customStart && !Number.isNaN(Date.parse(customStart))
      ? new Date(customStart).toISOString()
      : new Date(nowMs - 60 * 60 * 1000).toISOString();
    const end = customEnd && !Number.isNaN(Date.parse(customEnd))
      ? new Date(customEnd).toISOString()
      : new Date(nowMs).toISOString();
    return { start, end };
  }

  const option = TIME_RANGE_PRESETS.find((p) => p.id === preset);
  const durationMs = option?.durationMs ?? 15 * 60 * 1000;
  return {
    start: new Date(nowMs - durationMs).toISOString(),
    end: new Date(nowMs).toISOString(),
  };
}

export interface LogSearchCriteria {
  timeRangePreset: TimeRangePreset;
  customStart?: string;
  customEnd?: string;
  queryText: string;
  levels: string[];
  services: string[];
  environments: string[];
  traceId?: string;
  eventId?: string;
  filters?: StructuredFilter[];
  limit: number;
}
