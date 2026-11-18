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
    const valid=(value:string|undefined)=>{if(!value)return false;const match=/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);if(!match||Number(match[2])>23||Number(match[3])>59||Number(match[4]??0)>59||!Number.isFinite(Date.parse(value)))return false;return new Date(match[1]+'T00:00:00Z').toISOString().slice(0,10)===match[1];};
    if(!valid(customStart)||!valid(customEnd))throw new Error('Enter valid ISO UTC date/time values without calendar rollover.');
    if(!customStart||!customEnd||!Number.isFinite(Date.parse(customStart))||!Number.isFinite(Date.parse(customEnd))||Date.parse(customStart)>=Date.parse(customEnd))throw new Error('Enter a valid UTC start before the exclusive end.');
    const start=new Date(customStart).toISOString(),end=new Date(customEnd).toISOString();
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
  correlationId?: string;
  traceId?: string;
  eventId?: string;
  filters?: StructuredFilter[];
  limit: number;
}
