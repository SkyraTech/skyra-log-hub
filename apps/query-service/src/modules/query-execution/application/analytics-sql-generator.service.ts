import { Injectable } from '@nestjs/common';
import type {
  AuthorizedAggregationPlan,
  AggregationSpec,
  DateHistogramSpec,
  TermsAggregationSpec,
  CardinalityAggregationSpec,
} from '../../analytics/domain/aggregation.model.js';
import type { AuthorizedFacetsPlan, AllowedFacetField } from '../../analytics/domain/facet.model.js';
import { SqlGeneratorService } from './sql-generator.service.js';
import { resolveCanonicalField } from '../domain/canonical-field.model.js';
import { InvalidArgumentException } from '../../../common/errors/query.errors.js';

export interface GeneratedAnalyticsSql {
  readonly sql: string;
  readonly parameters: (string | number | bigint)[];
}

const INTERVAL_SQL_MAP: Record<string, string> = {
  '1m': "INTERVAL '1 minute'",
  '5m': "INTERVAL '5 minutes'",
  '15m': "INTERVAL '15 minutes'",
  '1h': "INTERVAL '1 hour'",
  '6h': "INTERVAL '6 hours'",
  '1d': "INTERVAL '1 day'",
};

@Injectable()
export class AnalyticsSqlGeneratorService {
  constructor(private readonly sqlGenerator: SqlGeneratorService) {}

  public generateAggregationQuery(
    plan: AuthorizedAggregationPlan,
    spec: AggregationSpec,
  ): GeneratedAnalyticsSql {
    const parameters: (string | number | bigint)[] = [];
    let paramIndex = 1;

    const nextParam = (val: string | number | bigint): string => {
      parameters.push(val);
      return `$${paramIndex++}`;
    };

    if (plan.descriptors.length === 0) {
      return {
        sql: 'SELECT 1 WHERE 1 = 0',
        parameters: [],
      };
    }

    const fileParams = plan.descriptors.map((d) => nextParam(d.resolvedPath));
    const fromClause = `read_ndjson_objects([${fileParams.join(', ')}])`;
    const whereClauses = this.buildBaseWhereClauses(plan, nextParam);

    switch (spec.type) {
      case 'date_histogram':
        return this.buildDateHistogramQuery(spec, fromClause, whereClauses, parameters);

      case 'terms':
        return this.buildTermsQuery(spec, fromClause, whereClauses, parameters);

      case 'cardinality':
        return this.buildCardinalityQuery(spec, fromClause, whereClauses, parameters);

      default: {
        const _exhaustiveCheck: never = spec;
        throw new InvalidArgumentException(`Unknown aggregation type: ${JSON.stringify(_exhaustiveCheck)}`);
      }
    }
  }

  public generateFacetQuery(
    plan: AuthorizedFacetsPlan,
    field: AllowedFacetField,
  ): GeneratedAnalyticsSql {
    const parameters: (string | number | bigint)[] = [];
    let paramIndex = 1;

    const nextParam = (val: string | number | bigint): string => {
      parameters.push(val);
      return `$${paramIndex++}`;
    };

    if (plan.descriptors.length === 0) {
      return {
        sql: 'SELECT 1 WHERE 1 = 0',
        parameters: [],
      };
    }

    const fileParams = plan.descriptors.map((d) => nextParam(d.resolvedPath));
    const fromClause = `read_ndjson_objects([${fileParams.join(', ')}])`;
    const whereClauses = this.buildBaseWhereClauses(plan, nextParam);
    const fieldExpr = this.resolveFieldExpression(field);

    const fullWhere = whereClauses.length > 0
      ? `WHERE ${whereClauses.join(' AND ')} AND ${fieldExpr} IS NOT NULL`
      : `WHERE ${fieldExpr} IS NOT NULL`;

    const sql = `SELECT ${fieldExpr} AS value, CAST(count(*) AS BIGINT) AS count FROM ${fromClause} ${fullWhere} GROUP BY value ORDER BY count DESC, value ASC LIMIT 50`;

    return { sql, parameters };
  }

  private buildDateHistogramQuery(
    spec: DateHistogramSpec,
    fromClause: string,
    whereClauses: string[],
    parameters: (string | number | bigint)[],
  ): GeneratedAnalyticsSql {
    const intervalSql = INTERVAL_SQL_MAP[spec.interval];
    if (!intervalSql) {
      throw new InvalidArgumentException(`Unsupported date histogram interval "${spec.interval}".`);
    }

    const fullWhere = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const sql = `SELECT strftime(time_bucket(${intervalSql}, CAST(json_extract_string(json, '$."@timestamp"') AS TIMESTAMP)), '%Y-%m-%dT%H:%M:%S.000Z') AS bucket_ts, CAST(count(*) AS BIGINT) AS count FROM ${fromClause} ${fullWhere} GROUP BY bucket_ts ORDER BY bucket_ts ASC`;

    return { sql, parameters };
  }

  private buildTermsQuery(
    spec: TermsAggregationSpec,
    fromClause: string,
    whereClauses: string[],
    parameters: (string | number | bigint)[],
  ): GeneratedAnalyticsSql {
    const fieldExpr = this.resolveFieldExpression(spec.field);
    const limit = Math.min(Math.max(spec.size || 10, 1), 50);

    const fullWhere = whereClauses.length > 0
      ? `WHERE ${whereClauses.join(' AND ')} AND ${fieldExpr} IS NOT NULL`
      : `WHERE ${fieldExpr} IS NOT NULL`;

    const sql = `SELECT ${fieldExpr} AS key, CAST(count(*) AS BIGINT) AS count FROM ${fromClause} ${fullWhere} GROUP BY key ORDER BY count DESC, key ASC LIMIT ${limit}`;

    return { sql, parameters };
  }

  private buildCardinalityQuery(
    spec: CardinalityAggregationSpec,
    fromClause: string,
    whereClauses: string[],
    parameters: (string | number | bigint)[],
  ): GeneratedAnalyticsSql {
    const fieldExpr = this.resolveFieldExpression(spec.field);

    const fullWhere = whereClauses.length > 0
      ? `WHERE ${whereClauses.join(' AND ')} AND ${fieldExpr} IS NOT NULL`
      : `WHERE ${fieldExpr} IS NOT NULL`;

    const sql = `SELECT CAST(count(DISTINCT ${fieldExpr}) AS BIGINT) AS val FROM ${fromClause} ${fullWhere}`;

    return { sql, parameters };
  }

  private buildBaseWhereClauses(
    plan: {
      readonly tenantId: string;
      readonly authorizedProjects: readonly string[];
      readonly environmentScopes?: readonly string[];
      readonly timeInterval: {
        readonly startInclusive: string;
        readonly endExclusive: string;
      };
      readonly filter?: import('../domain/query-filter.model.js').FilterAstNode;
    },
    nextParam: (val: string | number | bigint) => string,
  ): string[] {
    const whereClauses: string[] = [];

    // Tenant isolation: Double defense-in-depth row check
    const tenantParam = nextParam(plan.tenantId);
    whereClauses.push(`json_extract_string(json, '$.skyra.tenant_id') = ${tenantParam}`);

    // Project scope isolation
    if (plan.authorizedProjects.length === 1 && plan.authorizedProjects[0]) {
      const projParam = nextParam(plan.authorizedProjects[0]);
      whereClauses.push(`json_extract_string(json, '$.skyra.project_id') = ${projParam}`);
    } else if (plan.authorizedProjects.length > 1) {
      const projParams = plan.authorizedProjects.map((p) => nextParam(p));
      whereClauses.push(`json_extract_string(json, '$.skyra.project_id') IN (${projParams.join(', ')})`);
    }

    // Environment scopes
    if (plan.environmentScopes && plan.environmentScopes.length > 0) {
      const envParams = plan.environmentScopes.map((e) => nextParam(e));
      whereClauses.push(
        `(json_extract_string(json, '$.service.environment') IN (${envParams.join(', ')}) OR json_extract_string(json, '$.skyra.environment') IN (${envParams.join(', ')}))`,
      );
    }

    // Time interval (startInclusive <= @timestamp < endExclusive)
    const startParam = nextParam(plan.timeInterval.startInclusive);
    const endParam = nextParam(plan.timeInterval.endExclusive);
    whereClauses.push(`json_extract_string(json, '$."@timestamp"') >= ${startParam}`);
    whereClauses.push(`json_extract_string(json, '$."@timestamp"') < ${endParam}`);

    // AST Filters
    if (plan.filter) {
      const filterSql = this.sqlGenerator.compileAstNode(plan.filter, nextParam);
      if (filterSql) {
        whereClauses.push(filterSql);
      }
    }

    return whereClauses;
  }

  private resolveFieldExpression(field: string): string {
    const f = field.toLowerCase().trim();
    if (f === '@timestamp' || f === 'timestamp') {
      return `json_extract_string(json, '$."@timestamp"')`;
    }
    if (f === 'environment') {
      return `COALESCE(json_extract_string(json, '$.service.environment'), json_extract_string(json, '$.skyra.environment'))`;
    }

    const resolved = resolveCanonicalField(f);
    if (!resolved) {
      throw new InvalidArgumentException(`Cannot aggregate or facet on non-canonical field "${field}".`);
    }

    return `json_extract_string(json, '${resolved.jsonPath}')`;
  }
}
