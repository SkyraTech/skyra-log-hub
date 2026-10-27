import { Observable } from 'rxjs';

export interface StructuredFilter {
  field: string;
  operator: 'eq' | 'in' | 'contains' | 'exists' | 'gt' | 'gte' | 'lt' | 'lte';
  value?: unknown;
  values?: unknown[];
}

export interface SearchLogsRequest {
  time_range: {
    start: string;
    end: string;
  };
  projects: string[];
  query_text?: string;
  filters?: StructuredFilter[];
  sort_direction?: 'desc' | 'asc';
  limit?: number;
  cursor?: string;
}

export interface CanonicalLogEvent {
  '@timestamp': string;
  ecs: { version: string };
  event: { id: string; action?: string; duration?: number };
  log: { level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' };
  message: string;
  service: { name: string; environment?: string; version?: string };
  skyra: { tenant_id: string; project_id: string; schema_version: string };
  trace?: { id: string };
  span?: { id: string };
  error?: { type: string; message: string; stack_trace?: string };
  http?: { request?: { method: string }; response?: { status_code: number } };
  labels?: Record<string, string>;
  custom?: Record<string, unknown>;
}

export interface SearchLogsResponse {
  events: CanonicalLogEvent[];
  pagination: {
    total_returned: number;
    has_more: boolean;
    next_cursor?: string | null;
  };
}

export interface AggregationDefinition {
  name: string;
  type: 'date_histogram' | 'terms' | 'cardinality';
  field?: string;
  interval?: '1m' | '5m' | '15m' | '1h' | '6h' | '1d';
  size?: number;
}

export interface AggregateLogsRequest {
  time_range: { start: string; end: string };
  projects: string[];
  filters?: StructuredFilter[];
  aggregations: AggregationDefinition[];
}

export interface AggregationBucket {
  key: string | number;
  count: number;
}

export interface AggregateLogsResponse {
  aggregations: Record<string, {
    type: 'date_histogram' | 'terms' | 'cardinality';
    buckets: AggregationBucket[];
  }>;
}

export interface GetLogFacetsRequest {
  time_range: { start: string; end: string };
  projects: string[];
  filters?: StructuredFilter[];
  facet_fields: Array<'service.name' | 'log.level' | 'event.action' | 'environment' | 'error.type'>;
}

export interface FacetValueCount {
  value: string;
  count: number;
}

export interface GetLogFacetsResponse {
  facets: Record<string, FacetValueCount[]>;
}

export interface IQueryApiClient {
  searchLogs(request: SearchLogsRequest, abortSignal?: AbortSignal): Observable<SearchLogsResponse>;
  getLogEventById(eventId: string, projectId: string, dateHint?: string): Observable<CanonicalLogEvent>;
  aggregateLogs(request: AggregateLogsRequest, abortSignal?: AbortSignal): Observable<AggregateLogsResponse>;
  getLogFacets(request: GetLogFacetsRequest, abortSignal?: AbortSignal): Observable<GetLogFacetsResponse>;
}
