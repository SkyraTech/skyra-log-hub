import type { TrustedArchiveSegmentDescriptor } from '../../archive-discovery/domain/archive-segment-descriptor.model.js';
import type { FilterAstNode } from './query-filter.model.js';

export interface QuerySortSpecification {
  readonly field: '@timestamp' | 'timestamp' | string;
  readonly direction: 'asc' | 'desc';
}

export interface QueryResourceBudget {
  readonly maxSegments: number;
  readonly maxScannedBytes: number;
  readonly maxRows: number;
  readonly timeoutMs: number;
  readonly memoryBudgetMb: number;
}

export const DEFAULT_QUERY_RESOURCE_BUDGET: QueryResourceBudget = {
  maxSegments: 2000,
  maxScannedBytes: 500 * 1024 * 1024, // 500 MB
  maxRows: 500,
  timeoutMs: 30_000,
  memoryBudgetMb: 256,
};

export interface AuthorizedLogQueryPlan {
  readonly queryId: string;
  readonly tenantId: string;
  readonly authorizedProjects: readonly string[];
  readonly environmentScopes?: readonly string[];
  readonly descriptors: readonly TrustedArchiveSegmentDescriptor[];
  readonly timeInterval: {
    readonly startInclusive: string; // ISO 8601 UTC
    readonly endExclusive: string;   // ISO 8601 UTC
  };
  readonly filter?: FilterAstNode;
  readonly sort: QuerySortSpecification;
  readonly limit: number;
  readonly resourceBudget: QueryResourceBudget;
  readonly correlationId?: string;
  readonly actorId?: string;
}
