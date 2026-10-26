export interface DateHistogramBucketDto {
  timestamp: string;
  count: number;
}

export interface TermsBucketDto {
  key: string;
  count: number;
}

export interface DateHistogramAggregationResultDto {
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
  | CardinalityAggregationResultDto;

export interface QueryStatisticsDto {
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
  aggregations: Record<string, AggregationBucketResultDto>;
  statistics: QueryStatisticsDto;
  scope: QueryScopeDto;
}
