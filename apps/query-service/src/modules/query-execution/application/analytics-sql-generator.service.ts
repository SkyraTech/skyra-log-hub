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
import type { TrustedArchiveSegmentDescriptor } from '../../archive-discovery/domain/archive-segment-descriptor.model.js';

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

const PARQUET_COLUMN_MAP: Record<string, string> = {
  '@timestamp': '"@timestamp"',
  timestamp: '"@timestamp"',
  'log.level': 'log_level',
  level: 'log_level',
  'service.name': 'service_name',
  service: 'service_name',
  'event.action': 'event_action',
  action: 'event_action',
  environment: 'environment',
  'service.environment': 'environment',
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

    const isParquetOnly =
      (plan.descriptors?.length ?? 0) === 0 && (plan.parquetDescriptors?.length ?? 0) > 0;
    const canUseParquetDirect =
      isParquetOnly &&
      !plan.filter &&
      (spec.type === 'date_histogram' ||
        Boolean(PARQUET_COLUMN_MAP[spec.field?.toLowerCase()?.trim() ?? '']));

    const fromClause = this.buildFromClause(plan, nextParam, !canUseParquetDirect);
    if (!fromClause) {
      return {
        sql: 'SELECT 1 WHERE 1 = 0',
        parameters: [],
      };
    }

    const whereClauses = this.buildBaseWhereClauses(plan, nextParam, canUseParquetDirect);

    switch (spec.type) {
      case 'date_histogram':
        return this.buildDateHistogramQuery(spec, fromClause, whereClauses, parameters, canUseParquetDirect);

      case 'terms':
        return this.buildTermsQuery(spec, fromClause, whereClauses, parameters, canUseParquetDirect);

      case 'cardinality':
        return this.buildCardinalityQuery(spec, fromClause, whereClauses, parameters, canUseParquetDirect);

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

    const isParquetOnly =
      (plan.descriptors?.length ?? 0) === 0 && (plan.parquetDescriptors?.length ?? 0) > 0;
    const canUseParquetDirect =
      isParquetOnly && Boolean(PARQUET_COLUMN_MAP[field.toLowerCase().trim()]);

    const fromClause = this.buildFromClause(plan, nextParam, !canUseParquetDirect);
    if (!fromClause) {
      return {
        sql: 'SELECT 1 WHERE 1 = 0',
        parameters: [],
      };
    }

    const whereClauses = this.buildBaseWhereClauses(plan, nextParam, canUseParquetDirect);
    const fieldExpr = this.resolveFieldExpression(field, canUseParquetDirect);

    const fullWhere =
      whereClauses.length > 0
        ? `WHERE ${whereClauses.join(' AND ')} AND ${fieldExpr} IS NOT NULL`
        : `WHERE ${fieldExpr} IS NOT NULL`;

    const sql = `SELECT ${fieldExpr} AS value, CAST(count(*) AS BIGINT) AS count FROM ${fromClause} ${fullWhere} GROUP BY value ORDER BY count DESC, value ASC LIMIT 50`;

    return { sql, parameters };
  }

  private buildFromClause(
    plan: {
      readonly descriptors: readonly TrustedArchiveSegmentDescriptor[];
      readonly parquetDescriptors?: readonly (import('../../parquet-cache/domain/parquet-segment.model.js').TrustedParquetSegmentDescriptor)[];
    },
    nextParam: (val: string | number | bigint) => string,
    includeJson = true,
  ): string | null {
    const hasJsonl = (plan.descriptors?.length ?? 0) > 0;
    const hasParquet = (plan.parquetDescriptors?.length ?? 0) > 0;

    if (!hasJsonl && !hasParquet) {
      return null;
    }

    if (hasJsonl && !hasParquet) {
      const fileParams = plan.descriptors.map((d) => nextParam(d.resolvedPath.replace(/\\/g, '/')));
      return `read_ndjson_objects([${fileParams.join(', ')}])`;
    }

    if (!hasJsonl && hasParquet) {
      const fileParams = plan.parquetDescriptors!.map((d) => nextParam(d.resolvedPath.replace(/\\/g, '/')));
      if (!includeJson) {
        return `(SELECT "@timestamp", "tenant_id", "project_id", "environment", "service_name", "log_level", "event_action" FROM read_parquet([${fileParams.join(', ')}]))`;
      }
      return `read_parquet([${fileParams.join(', ')}])`;
    }

    const parquetParams = plan.parquetDescriptors!.map((d) => nextParam(d.resolvedPath.replace(/\\/g, '/')));
    const jsonlParams = plan.descriptors.map((d) => nextParam(d.resolvedPath.replace(/\\/g, '/')));
    return `(SELECT json FROM read_parquet([${parquetParams.join(', ')}]) UNION ALL SELECT json FROM read_ndjson_objects([${jsonlParams.join(', ')}]))`;
  }

  private buildDateHistogramQuery(
    spec: DateHistogramSpec,
    fromClause: string,
    whereClauses: string[],
    parameters: (string | number | bigint)[],
    isParquetDirect = false,
  ): GeneratedAnalyticsSql {
    const intervalSql = INTERVAL_SQL_MAP[spec.interval];
    if (!intervalSql) {
      throw new InvalidArgumentException(`Unsupported date histogram interval "${spec.interval}".`);
    }

    const fullWhere = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const tsExpr = isParquetDirect
      ? 'CAST("@timestamp" AS TIMESTAMP)'
      : 'CAST(json_extract_string(json, \'$."@timestamp"\') AS TIMESTAMP)';

    const sql = `SELECT strftime(time_bucket(${intervalSql}, ${tsExpr}), '%Y-%m-%dT%H:%M:%S.000Z') AS bucket_ts, CAST(count(*) AS BIGINT) AS count FROM ${fromClause} ${fullWhere} GROUP BY bucket_ts ORDER BY bucket_ts ASC`;

    return { sql, parameters };
  }

  private buildTermsQuery(
    spec: TermsAggregationSpec,
    fromClause: string,
    whereClauses: string[],
    parameters: (string | number | bigint)[],
    isParquetDirect = false,
  ): GeneratedAnalyticsSql {
    const fieldExpr = this.resolveFieldExpression(spec.field, isParquetDirect);
    const limit = Math.min(Math.max(spec.size || 10, 1), 50);

    const fullWhere =
      whereClauses.length > 0
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
    isParquetDirect = false,
  ): GeneratedAnalyticsSql {
    const fieldExpr = this.resolveFieldExpression(spec.field, isParquetDirect);

    const fullWhere =
      whereClauses.length > 0
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
    isParquetDirect = false,
  ): string[] {
    const whereClauses: string[] = [];

    // Tenant isolation: Double defense-in-depth row check
    const tenantParam = nextParam(plan.tenantId);
    if (isParquetDirect) {
      whereClauses.push(`"tenant_id" = ${tenantParam}`);
    } else {
      whereClauses.push(`json_extract_string(json, '$.skyra.tenant_id') = ${tenantParam}`);
    }

    // Project scope isolation
    if (plan.authorizedProjects.length === 1 && plan.authorizedProjects[0]) {
      const projParam = nextParam(plan.authorizedProjects[0]);
      if (isParquetDirect) {
        whereClauses.push(`"project_id" = ${projParam}`);
      } else {
        whereClauses.push(`json_extract_string(json, '$.skyra.project_id') = ${projParam}`);
      }
    } else if (plan.authorizedProjects.length > 1) {
      const projParams = plan.authorizedProjects.map((p) => nextParam(p));
      if (isParquetDirect) {
        whereClauses.push(`"project_id" IN (${projParams.join(', ')})`);
      } else {
        whereClauses.push(`json_extract_string(json, '$.skyra.project_id') IN (${projParams.join(', ')})`);
      }
    }

    // Environment scopes
    if (plan.environmentScopes && plan.environmentScopes.length > 0) {
      const envParams = plan.environmentScopes.map((e) => nextParam(e));
      if (isParquetDirect) {
        whereClauses.push(`"environment" IN (${envParams.join(', ')})`);
      } else {
        whereClauses.push(
          `(json_extract_string(json, '$.service.environment') IN (${envParams.join(', ')}) OR json_extract_string(json, '$.skyra.environment') IN (${envParams.join(', ')}))`,
        );
      }
    }

    // Time interval (startInclusive <= @timestamp < endExclusive)
    const startParam = nextParam(plan.timeInterval.startInclusive);
    const endParam = nextParam(plan.timeInterval.endExclusive);
    if (isParquetDirect) {
      whereClauses.push(`"@timestamp" >= ${startParam}`);
      whereClauses.push(`"@timestamp" < ${endParam}`);
    } else {
      whereClauses.push(`json_extract_string(json, '$."@timestamp"') >= ${startParam}`);
      whereClauses.push(`json_extract_string(json, '$."@timestamp"') < ${endParam}`);
    }

    // AST Filters
    if (plan.filter) {
      const filterSql = this.sqlGenerator.compileAstNode(plan.filter, nextParam);
      if (filterSql) {
        whereClauses.push(filterSql);
      }
    }

    return whereClauses;
  }

  private resolveFieldExpression(field: string, isParquetDirect = false): string {
    const f = field.toLowerCase().trim();
    if (isParquetDirect && PARQUET_COLUMN_MAP[f]) {
      return PARQUET_COLUMN_MAP[f]!;
    }

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

