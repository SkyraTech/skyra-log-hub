import type { AuthorizedLogQueryPlan } from './authorized-query-plan.model.js';
import type { BoundedLogQueryResult } from './bounded-query-result.model.js';
import type {
  AuthorizedAggregationPlan,
  AggregationQueryResult,
} from '../../analytics/domain/aggregation.model.js';
import type {
  AuthorizedFacetsPlan,
  FacetsQueryResult,
} from '../../analytics/domain/facet.model.js';

export const LOG_QUERY_EXECUTION_PORT = Symbol('LOG_QUERY_EXECUTION_PORT');

export interface ILogQueryExecutionPort {
  execute(
    plan: AuthorizedLogQueryPlan,
    signal?: AbortSignal,
  ): Promise<BoundedLogQueryResult>;

  executeAggregation(
    plan: AuthorizedAggregationPlan,
    signal?: AbortSignal,
  ): Promise<AggregationQueryResult>;

  executeFacets(
    plan: AuthorizedFacetsPlan,
    signal?: AbortSignal,
  ): Promise<FacetsQueryResult>;
}
