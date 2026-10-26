import type { RawFilterInput } from '../../../query-execution/domain/query-filter.model.js';

export interface TimeRangeDto {
  start: string;
  end: string;
}

export interface AggregationItemDto {
  name: string;
  type: 'date_histogram' | 'terms' | 'cardinality';
  field: string;
  interval?: '1m' | '5m' | '15m' | '1h' | '6h' | '1d';
  size?: number;
}

export interface AggregateRequestDto {
  time_range: TimeRangeDto;
  projects?: string[];
  environments?: string[];
  services?: string[];
  levels?: string[];
  query_text?: string;
  filters?: RawFilterInput[];
  aggregations: AggregationItemDto[];
}
