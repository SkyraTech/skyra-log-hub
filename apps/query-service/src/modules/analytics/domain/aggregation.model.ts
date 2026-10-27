import type { TrustedArchiveSegmentDescriptor } from '../../archive-discovery/domain/archive-segment-descriptor.model.js';
import type { TrustedParquetSegmentDescriptor } from '../../parquet-cache/domain/parquet-segment.model.js';
import type { FilterAstNode } from '../../query-execution/domain/query-filter.model.js';

export type AggregationType = 'date_histogram' | 'terms' | 'cardinality';

export type DateHistogramInterval = '1m' | '5m' | '15m' | '1h' | '6h' | '1d';

export interface DateHistogramSpec {
  readonly name: string;
  readonly type: 'date_histogram';
  readonly field?: string;
  readonly interval: DateHistogramInterval;
}

export interface TermsAggregationSpec {
  readonly name: string;
  readonly type: 'terms';
  readonly field: string;
  readonly size?: number;
}

export interface CardinalityAggregationSpec {
  readonly name: string;
  readonly type: 'cardinality';
  readonly field: string;
}

export type AggregationSpec =
  | DateHistogramSpec
  | TermsAggregationSpec
  | CardinalityAggregationSpec;

export interface AuthorizedAggregationPlan {
  readonly queryId: string;
  readonly tenantId: string;
  readonly authorizedProjects: readonly string[];
  readonly environmentScopes?: readonly string[];
  readonly descriptors: readonly TrustedArchiveSegmentDescriptor[];
  readonly parquetDescriptors?: readonly TrustedParquetSegmentDescriptor[];
  readonly timeInterval: {
    readonly startInclusive: string;
    readonly endExclusive: string;
  };
  readonly filter?: FilterAstNode;
  readonly aggregations: readonly AggregationSpec[];
  readonly resourceBudget: {
    readonly maxSegments: number;
    readonly maxScannedBytes: number;
    readonly timeoutMs: number;
    readonly memoryBudgetMb?: number;
  };
}

export interface DateHistogramBucket {
  readonly timestamp: string;
  readonly count: number;
}

export interface TermsBucket {
  readonly key: string;
  readonly count: number;
}

export interface DateHistogramResult {
  readonly type: 'date_histogram';
  readonly buckets: readonly DateHistogramBucket[];
}

export interface TermsResult {
  readonly type: 'terms';
  readonly buckets: readonly TermsBucket[];
}

export interface CardinalityResult {
  readonly type: 'cardinality';
  readonly value: number;
}

export type SingleAggregationResult =
  | DateHistogramResult
  | TermsResult
  | CardinalityResult;

export interface AggregationQueryResult {
  readonly aggregations: Record<string, SingleAggregationResult>;
  readonly scannedBytes: number;
  readonly scannedSegments: number;
  readonly executionTimeMs: number;
  readonly archiveWatermark: string;
  readonly tenantId: string;
  readonly searchedProjects: readonly string[];
}
