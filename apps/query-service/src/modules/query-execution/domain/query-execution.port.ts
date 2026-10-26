import type { AuthorizedLogQueryPlan } from './authorized-query-plan.model.js';
import type { BoundedLogQueryResult } from './bounded-query-result.model.js';

export const LOG_QUERY_EXECUTION_PORT = Symbol('LOG_QUERY_EXECUTION_PORT');

export interface ILogQueryExecutionPort {
  execute(
    plan: AuthorizedLogQueryPlan,
    signal?: AbortSignal,
  ): Promise<BoundedLogQueryResult>;
}
