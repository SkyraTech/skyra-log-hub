import type { TrustedArchiveSegmentDescriptor } from '../../archive-discovery/domain/archive-segment-descriptor.model.js';
import type { TrustedParquetSegmentDescriptor } from '../../parquet-cache/domain/parquet-segment.model.js';
import type { FilterAstNode } from '../../query-execution/domain/query-filter.model.js';

export type AllowedFacetField =
  | 'service.name'
  | 'log.level'
  | 'event.action'
  | 'environment'
  | 'error.type';

export interface AuthorizedFacetsPlan {
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
  readonly facetFields: readonly AllowedFacetField[];
  readonly resourceBudget: {
    readonly maxSegments: number;
    readonly maxScannedBytes: number;
    readonly timeoutMs: number;
    readonly memoryBudgetMb?: number;
  };
}

export interface FacetValueCount {
  readonly value: string;
  readonly count: number;
}

export interface FacetsQueryResult {
  readonly facets: Record<string, readonly FacetValueCount[]>;
  readonly scannedBytes: number;
  readonly scannedSegments: number;
  readonly executionTimeMs: number;
  readonly archiveWatermark: string;
  readonly tenantId: string;
  readonly searchedProjects: readonly string[];
}
