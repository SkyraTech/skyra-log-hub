export interface DateHistogramBucketDto {
  timestamp: string;
  count: number;
}

export interface TermsBucketDto {
  key: string;
  count: number;
}

export interface DateHistogramAggregationResultDto {
  interval_ms?: number;
  type: 'date_histogram';
  buckets: DateHistogramBucketDto[];
}

export interface TermsAggregationResultDto {
  type: 'terms';
  buckets: TermsBucketDto[];
}

export interface CardinalityAggregationResultDto {
  type: 'cardinality';
  value: number;
}

export type AggregationBucketResultDto =
  | DateHistogramAggregationResultDto
  | TermsAggregationResultDto
  | CardinalityAggregationResultDto
  | {type:'service_trend';buckets:{service:string;timestamp:string;count:number;errors:number;warnings:number}[]};

export interface QueryStatisticsDto {
  partial_results?: boolean;
  unavailable_segments?: number;
  scanned_bytes: number;
  scanned_segments: number;
  execution_time_ms: number;
  archive_watermark: string;
}

export interface QueryScopeDto {
  tenant_id: string;
  searched_projects: string[];
}

export interface AggregateResponseDto {
  query_range?: {start:string;end:string;timezone:'UTC'};
  aggregations: Record<string, AggregationBucketResultDto>;
  statistics: QueryStatisticsDto;
  scope: QueryScopeDto;
}
