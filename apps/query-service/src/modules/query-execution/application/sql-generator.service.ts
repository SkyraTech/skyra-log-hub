import { Injectable } from '@nestjs/common';
import type { AuthorizedLogQueryPlan } from '../domain/authorized-query-plan.model.js';
import type {
  FilterAstNode,
  BinaryFilterAstNode,
  InFilterAstNode,
  ContainsFilterAstNode,
  ExistsFilterAstNode,
  LogicalFilterAstNode,
} from '../domain/query-filter.model.js';

export interface GeneratedSqlQuery {
  readonly sql: string;
  readonly parameters: readonly (string | number | bigint)[];
  readonly fileCount: number;
  readonly limit: number;
}

@Injectable()
export class SqlGeneratorService {
  /**
   * Generates a fully parameterized SQL statement and parameter array from an authorized query plan.
   */
  public generate(plan: AuthorizedLogQueryPlan): GeneratedSqlQuery {
    const parameters: (string | number | bigint)[] = [];
    let paramIndex = 1;

    const nextParam = (value: string | number | bigint): string => {
      parameters.push(value);
      return `$${paramIndex++}`;
    };

    // 1. Source tables (files)
    if (plan.descriptors.length === 0) {
      return {
        sql: 'SELECT CAST(NULL AS VARCHAR) AS "@timestamp", CAST(NULL AS VARCHAR) AS "event.id", CAST(NULL AS VARCHAR) AS "segment_id", CAST(NULL AS BIGINT) AS "record_offset", CAST(NULL AS VARCHAR) AS json WHERE 1 = 0',
        parameters: [],
        fileCount: 0,
        limit: 0,
      };
    }

    const fileParams: string[] = [];
    for (const descriptor of plan.descriptors) {
      // Normalize to forward slashes for cross-platform DuckDB safety
      const normalizedPath = descriptor.resolvedPath.replace(/\\/g, '/');
      fileParams.push(nextParam(normalizedPath));
    }

    const fromClause = `(
      SELECT
        json_extract_string(json, '$."@timestamp"') AS "@timestamp",
        json_extract_string(json, '$.event.id') AS "event.id",
        regexp_extract(filename, '([^/\\\\]+)$', 1) AS "segment_id",
        CAST(row_number() OVER (PARTITION BY filename) - 1 AS BIGINT) AS "record_offset",
        json
      FROM read_ndjson_objects([${fileParams.join(', ')}], filename=true)
    )`;

    // 2. WHERE clauses
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

    // Environment scopes if provided
    if (plan.environmentScopes && plan.environmentScopes.length > 0) {
      const envParams = plan.environmentScopes.map((e) => nextParam(e));
      whereClauses.push(
        `(json_extract_string(json, '$.service.environment') IN (${envParams.join(', ')}) OR json_extract_string(json, '$.skyra.environment') IN (${envParams.join(', ')}))`,
      );
    }

    // Time boundaries (startInclusive <= @timestamp < endExclusive)
    const startParam = nextParam(plan.timeInterval.startInclusive);
    const endParam = nextParam(plan.timeInterval.endExclusive);
    whereClauses.push(`json_extract_string(json, '$."@timestamp"') >= ${startParam}`);
    whereClauses.push(`json_extract_string(json, '$."@timestamp"') < ${endParam}`);

    // AST Filters
    if (plan.filter) {
      const filterSql = this.compileAstNode(plan.filter, nextParam);
      if (filterSql) {
        whereClauses.push(filterSql);
      }
    }

    // Keyset pagination continuation using full 4-part stable tuple
    if (plan.cursorPosition) {
      const cTs = nextParam(plan.cursorPosition.timestamp);
      const cEid = nextParam(plan.cursorPosition.eventId);
      const cSeg = nextParam(plan.cursorPosition.segmentId);
      const cOffset = nextParam(BigInt(plan.cursorPosition.recordOffset));

      if (plan.sort.direction === 'asc') {
        whereClauses.push(
          `("@timestamp" > ${cTs} OR ("@timestamp" = ${cTs} AND "event.id" > ${cEid}) OR ("@timestamp" = ${cTs} AND "event.id" = ${cEid} AND "segment_id" > ${cSeg}) OR ("@timestamp" = ${cTs} AND "event.id" = ${cEid} AND "segment_id" = ${cSeg} AND "record_offset" > ${cOffset}))`,
        );
      } else {
        whereClauses.push(
          `("@timestamp" < ${cTs} OR ("@timestamp" = ${cTs} AND "event.id" < ${cEid}) OR ("@timestamp" = ${cTs} AND "event.id" = ${cEid} AND "segment_id" < ${cSeg}) OR ("@timestamp" = ${cTs} AND "event.id" = ${cEid} AND "segment_id" = ${cSeg} AND "record_offset" < ${cOffset}))`,
        );
      }
    }

    const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // 3. ORDER BY with deterministic total ordering
    const direction = plan.sort.direction === 'asc' ? 'ASC' : 'DESC';
    const orderByClause = `ORDER BY "@timestamp" ${direction}, "event.id" ${direction}, "segment_id" ${direction}, "record_offset" ${direction}`;

    // 4. LIMIT
    const baseLimit = plan.fetchExtraRow ? plan.limit + 1 : plan.limit;
    const effectiveLimit = Math.min(baseLimit, plan.resourceBudget.maxRows + (plan.fetchExtraRow ? 1 : 0));
    const limitParam = nextParam(BigInt(effectiveLimit));
    const limitClause = `LIMIT ${limitParam}`;

    const sql = `SELECT "@timestamp", "event.id", "segment_id", "record_offset", json FROM ${fromClause} AS raw_records ${whereClause} ${orderByClause} ${limitClause}`;

    return {
      sql,
      parameters,
      fileCount: plan.descriptors.length,
      limit: effectiveLimit,
    };
  }

  private compileAstNode(
    node: FilterAstNode,
    nextParam: (value: string | number | bigint) => string,
  ): string {
    switch (node.kind) {
      case 'binary':
        return this.compileBinaryNode(node, nextParam);

      case 'in':
        return this.compileInNode(node, nextParam);

      case 'contains':
        return this.compileContainsNode(node, nextParam);

      case 'exists':
        return this.compileExistsNode(node);

      case 'logical':
        return this.compileLogicalNode(node, nextParam);

      default: {
        const _exhaustiveCheck: never = node;
        throw new Error(`Unhandled FilterAstNode kind: ${JSON.stringify(_exhaustiveCheck)}`);
      }
    }
  }

  private compileBinaryNode(
    node: BinaryFilterAstNode,
    nextParam: (value: string | number | bigint) => string,
  ): string {
    const operatorMap: Record<BinaryFilterAstNode['operator'], string> = {
      eq: '=',
      neq: '!=',
      gt: '>',
      gte: '>=',
      lt: '<',
      lte: '<=',
    };
    const sqlOp = operatorMap[node.operator];

    if (node.field.dataType === 'number') {
      const param = nextParam(BigInt(node.value));
      return `TRY_CAST(json_extract_string(json, '${node.field.jsonPath}') AS BIGINT) ${sqlOp} ${param}`;
    }

    const param = nextParam(String(node.value));
    return `json_extract_string(json, '${node.field.jsonPath}') ${sqlOp} ${param}`;
  }

  private compileInNode(
    node: InFilterAstNode,
    nextParam: (value: string | number | bigint) => string,
  ): string {
    const sqlOp = node.operator === 'in' ? 'IN' : 'NOT IN';

    if (node.field.dataType === 'number') {
      const params = node.values.map((v) => nextParam(BigInt(v)));
      return `TRY_CAST(json_extract_string(json, '${node.field.jsonPath}') AS BIGINT) ${sqlOp} (${params.join(', ')})`;
    }

    const params = node.values.map((v) => nextParam(String(v)));
    return `json_extract_string(json, '${node.field.jsonPath}') ${sqlOp} (${params.join(', ')})`;
  }

  private compileContainsNode(
    node: ContainsFilterAstNode,
    nextParam: (value: string | number | bigint) => string,
  ): string {
    const param = nextParam(node.substring);
    return `contains(lower(json_extract_string(json, '${node.field.jsonPath}')), lower(${param}))`;
  }

  private compileExistsNode(node: ExistsFilterAstNode): string {
    if (node.exists) {
      return `(json_extract(json, '${node.field.jsonPath}') IS NOT NULL AND json_extract_string(json, '${node.field.jsonPath}') IS NOT NULL)`;
    }
    return `(json_extract(json, '${node.field.jsonPath}') IS NULL OR json_extract_string(json, '${node.field.jsonPath}') IS NULL)`;
  }

  private compileLogicalNode(
    node: LogicalFilterAstNode,
    nextParam: (value: string | number | bigint) => string,
  ): string {
    if (node.children.length === 0) {
      return '';
    }
    const glue = node.operator === 'and' ? ' AND ' : ' OR ';
    const compiledChildren = node.children
      .map((child) => this.compileAstNode(child, nextParam))
      .filter((s) => s.length > 0);

    if (compiledChildren.length === 0) {
      return '';
    }
    if (compiledChildren.length === 1 && compiledChildren[0]) {
      return compiledChildren[0];
    }
    return `(${compiledChildren.join(glue)})`;
  }
}
