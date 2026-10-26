export interface TimeRangeDto {
  readonly start: string;
  readonly end: string;
}

export interface StructuredFilterDto {
  readonly field: string;
  readonly operator:
    | 'eq'
    | 'neq'
    | 'in'
    | 'not_in'
    | 'contains'
    | 'exists'
    | 'gt'
    | 'gte'
    | 'lt'
    | 'lte';
  readonly value?: unknown;
}

export interface SortDto {
  readonly field?: string;
  readonly direction?: 'asc' | 'desc';
}

export interface SearchRequestDto {
  readonly time_range: TimeRangeDto;
  readonly projects?: readonly string[];
  readonly environments?: readonly string[];
  readonly services?: readonly string[];
  readonly levels?: readonly string[];
  readonly query_text?: string;
  readonly trace_id?: string;
  readonly event_id?: string;
  readonly filters?: readonly StructuredFilterDto[];
  readonly sort?: SortDto;
  readonly limit?: number;
  readonly cursor?: string;
}
