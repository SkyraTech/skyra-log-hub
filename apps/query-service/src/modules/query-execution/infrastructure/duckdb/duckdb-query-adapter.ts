import * as fs from 'node:fs';
import * as path from 'node:path';
import { Injectable, Logger, Optional } from '@nestjs/common';
import type { ILogQueryExecutionPort } from '../../domain/query-execution.port.js';
import type { AuthorizedLogQueryPlan, StableCursorPosition } from '../../domain/authorized-query-plan.model.js';
import type {
  BoundedLogQueryResult,
  CanonicalLogEventRecord,
} from '../../domain/bounded-query-result.model.js';
import type {
  AuthorizedAggregationPlan,
  AggregationQueryResult,
  SingleAggregationResult,
} from '../../../analytics/domain/aggregation.model.js';
import type {
  AuthorizedFacetsPlan,
  FacetsQueryResult,
  FacetValueCount,
} from '../../../analytics/domain/facet.model.js';
import { DuckDbInstanceManager } from './duckdb-instance.manager.js';
import { SqlGeneratorService } from '../../application/sql-generator.service.js';
import { AnalyticsSqlGeneratorService } from '../../application/analytics-sql-generator.service.js';
import { QueryResourceGovernorService } from './query-resource-governor.service.js';
import { QueryAuditService } from '../../../audit/query-audit.service.js';
import type { TrustedArchiveSegmentDescriptor } from '../../../archive-discovery/domain/archive-segment-descriptor.model.js';
import type { DuckDBPreparedStatement } from '@duckdb/node-api';
import {
  DuckDbUnavailableException,
  QueryCancelledException,
  QueryTimeoutException,
  CrossTenantViolationException,
  ForbiddenProjectException,
  ArchiveIntegrityException,
  ArchiveNotFoundException,
  PathTraversalException,
} from '../../../../common/errors/query.errors.js';

interface RawRowResult {
  readonly timestamp: string;
  readonly eventId: string;
  readonly segmentId: string;
  readonly recordOffset: number;
  readonly event: CanonicalLogEventRecord;
}

@Injectable()
export class DuckDbLogQueryAdapter implements ILogQueryExecutionPort {
  private readonly logger = new Logger(DuckDbLogQueryAdapter.name);

  private readonly analyticsSqlGenerator: AnalyticsSqlGeneratorService;

  constructor(
    private readonly instanceManager: DuckDbInstanceManager,
    private readonly sqlGenerator: SqlGeneratorService,
    private readonly resourceGovernor: QueryResourceGovernorService,
    private readonly audit: QueryAuditService,
    @Optional() analyticsSqlGenerator?: AnalyticsSqlGeneratorService,
  ) {
    this.analyticsSqlGenerator =
      analyticsSqlGenerator ?? new AnalyticsSqlGeneratorService(this.sqlGenerator);
  }

  public async execute(
    plan: AuthorizedLogQueryPlan,
    signal?: AbortSignal,
  ): Promise<BoundedLogQueryResult> {
    const startTimeNs = process.hrtime.bigint();

    // Fast-path for 0 eligible segments
    if (plan.descriptors.length === 0) {
      return {
        queryId: plan.queryId,
        events: [],
        matchedCount: 0,
        scannedSegmentCount: 0,
        scannedBytes: 0,
        executionDurationMs: 0,
        timeInterval: plan.timeInterval,
        truncated: false,
        tieBreakerApplied: true,
        hasMore: false,
      };
    }

    // MANDATORY SECURITY GATE P0-A: Pre-Read Tenant & Filesystem Isolation
    this.validateDescriptorProvenance(
      plan.descriptors,
      plan.tenantId,
      plan.authorizedProjects,
      plan.actorId,
      plan.correlationId,
    );

    const totalScannedBytes = plan.descriptors.reduce((acc, d) => acc + d.byteSize, 0);

    return this.resourceGovernor.schedule(
      plan.queryId,
      plan.tenantId,
      plan.resourceBudget.timeoutMs,
      async (onAbort) => {
        const generated = this.sqlGenerator.generate(plan);
        const conn = await this.instanceManager.createConnection();

        // Wire up true query cancellation via conn.interrupt()
        onAbort(() => {
          try {
            this.logger.warn(`Triggering DuckDB connection interrupt for query ${plan.queryId}`);
            conn.interrupt();
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.warn(`Failed to interrupt DuckDB connection: ${msg}`);
          }
        });

        try {
          const prep = await conn.prepare(generated.sql);
          this.bindPreparedStatement(prep, generated.parameters);

          const reader = await prep.run();
          const rows = await reader.getRows();

          const parsedRows: RawRowResult[] = [];
          for (const row of rows) {
            const tsCol = String(row[0] ?? '');
            const eidCol = String(row[1] ?? '');
            const segCol = String(row[2] ?? '');
            const offsetCol = Number(row[3] ?? 0);
            const jsonCol = row[4];

            if (typeof jsonCol === 'string') {
              try {
                const event = JSON.parse(jsonCol) as CanonicalLogEventRecord;
                parsedRows.push({
                  timestamp: tsCol,
                  eventId: eidCol,
                  segmentId: segCol,
                  recordOffset: offsetCol,
                  event,
                });
              } catch (parseErr: unknown) {
                this.logger.warn(`Failed to parse canonical log event JSON: ${String(parseErr)}`);
              }
            }
          }

          let hasMore = false;
          let lastPosition: StableCursorPosition | undefined;
          let events: CanonicalLogEventRecord[] = [];

          if (plan.fetchExtraRow) {
            if (parsedRows.length > plan.limit) {
              hasMore = true;
              const trimmed = parsedRows.slice(0, plan.limit);
              events = trimmed.map((r) => r.event);
              const lastItem = trimmed[trimmed.length - 1];
              if (lastItem) {
                lastPosition = {
                  timestamp: lastItem.timestamp,
                  eventId: lastItem.eventId,
                  segmentId: lastItem.segmentId,
                  recordOffset: lastItem.recordOffset,
                };
              }
            } else {
              hasMore = false;
              events = parsedRows.map((r) => r.event);
              const lastItem = parsedRows[parsedRows.length - 1];
              if (lastItem) {
                lastPosition = {
                  timestamp: lastItem.timestamp,
                  eventId: lastItem.eventId,
                  segmentId: lastItem.segmentId,
                  recordOffset: lastItem.recordOffset,
                };
              }
            }
          } else {
            events = parsedRows.map((r) => r.event);
            hasMore = events.length >= plan.limit;
            const lastItem = parsedRows[parsedRows.length - 1];
            if (lastItem) {
              lastPosition = {
                timestamp: lastItem.timestamp,
                eventId: lastItem.eventId,
                segmentId: lastItem.segmentId,
                recordOffset: lastItem.recordOffset,
              };
            }
          }

          const durationNs = process.hrtime.bigint() - startTimeNs;
          const durationMs = Number(durationNs) / 1_000_000;

          const isTruncated = plan.fetchExtraRow ? hasMore : events.length >= plan.limit;

          return {
            queryId: plan.queryId,
            events,
            matchedCount: events.length,
            scannedSegmentCount: plan.descriptors.length,
            scannedBytes: totalScannedBytes,
            executionDurationMs: Math.round(durationMs),
            timeInterval: plan.timeInterval,
            truncated: isTruncated,
            tieBreakerApplied: true,
            hasMore,
            lastPosition,
          };
        } catch (err: unknown) {
          if (err instanceof QueryTimeoutException || err instanceof QueryCancelledException) {
            throw err;
          }

          const errMsg = err instanceof Error ? err.message : String(err);
          if (errMsg.toLowerCase().includes('interrupted') || errMsg.toLowerCase().includes('cancelled')) {
            throw new QueryCancelledException(`Query ${plan.queryId} execution was interrupted.`);
          }

          this.logger.error(`DuckDB execution failed for query ${plan.queryId}: ${errMsg}`);
          throw new DuckDbUnavailableException(`Analytical execution error: ${errMsg}`);
        } finally {
          try {
            conn.closeSync();
          } catch (closeErr: unknown) {
            const msg = closeErr instanceof Error ? closeErr.message : String(closeErr);
            this.logger.warn(`Error closing DuckDB connection for query ${plan.queryId}: ${msg}`);
          }
        }
      },
      signal,
    );
  }

  public async executeAggregation(
    plan: AuthorizedAggregationPlan,
    signal?: AbortSignal,
  ): Promise<AggregationQueryResult> {
    const startTimeNs = process.hrtime.bigint();

    if (plan.descriptors.length === 0) {
      const aggregations: Record<string, SingleAggregationResult> = {};
      for (const spec of plan.aggregations) {
        if (spec.type === 'date_histogram') {
          aggregations[spec.name] = { type: 'date_histogram', buckets: [] };
        } else if (spec.type === 'terms') {
          aggregations[spec.name] = { type: 'terms', buckets: [] };
        } else if (spec.type === 'cardinality') {
          aggregations[spec.name] = { type: 'cardinality', value: 0 };
        }
      }
      return {
        aggregations,
        scannedBytes: 0,
        scannedSegments: 0,
        executionTimeMs: 0,
        archiveWatermark: new Date().toISOString(),
        tenantId: plan.tenantId,
        searchedProjects: plan.authorizedProjects,
      };
    }

    // MANDATORY SECURITY GATE P0-A: Pre-Read Tenant & Filesystem Isolation
    this.validateDescriptorProvenance(
      plan.descriptors,
      plan.tenantId,
      plan.authorizedProjects,
      'analytics-actor',
      plan.queryId,
    );

    const totalScannedBytes = plan.descriptors.reduce((acc, d) => acc + d.byteSize, 0);
    const latestDate = plan.descriptors
      .map((d) => d.date)
      .sort()
      .pop() || new Date().toISOString();
    const archiveWatermark = latestDate.includes('T') ? latestDate : `${latestDate}T23:59:59.999Z`;

    return this.resourceGovernor.schedule(
      plan.queryId,
      plan.tenantId,
      plan.resourceBudget.timeoutMs,
      async (onAbort) => {
        const conn = await this.instanceManager.createConnection();

        onAbort(() => {
          try {
            this.logger.warn(`Triggering DuckDB connection interrupt for aggregation query ${plan.queryId}`);
            conn.interrupt();
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.warn(`Failed to interrupt DuckDB connection: ${msg}`);
          }
        });

        try {
          const results: Record<string, SingleAggregationResult> = {};

          for (const spec of plan.aggregations) {
            const generated = this.analyticsSqlGenerator.generateAggregationQuery(plan, spec);
            const prep = await conn.prepare(generated.sql);

            try {
              this.bindPreparedStatement(prep, generated.parameters);
              const reader = await prep.run();
              const rows = await reader.getRows();

              if (spec.type === 'date_histogram') {
                const buckets = rows.map((r) => ({
                  timestamp: String(r[0] ?? ''),
                  count: Number(r[1] ?? 0),
                }));
                results[spec.name] = {
                  type: 'date_histogram',
                  buckets,
                };
              } else if (spec.type === 'terms') {
                const buckets = rows.map((r) => ({
                  key: String(r[0] ?? ''),
                  count: Number(r[1] ?? 0),
                }));
                results[spec.name] = {
                  type: 'terms',
                  buckets,
                };
              } else if (spec.type === 'cardinality') {
                const value = rows.length > 0 ? Number(rows[0]![0] ?? 0) : 0;
                results[spec.name] = {
                  type: 'cardinality',
                  value,
                };
              }
            } catch (err: unknown) {
              throw err;
            }
          }

          const durationMs = Number(process.hrtime.bigint() - startTimeNs) / 1_000_000;

          return {
            aggregations: results,
            scannedBytes: totalScannedBytes,
            scannedSegments: plan.descriptors.length,
            executionTimeMs: Math.round(durationMs),
            archiveWatermark,
            tenantId: plan.tenantId,
            searchedProjects: plan.authorizedProjects,
          };
        } catch (err: unknown) {
          if (err instanceof QueryTimeoutException || err instanceof QueryCancelledException) {
            throw err;
          }
          const errMsg = err instanceof Error ? err.message : String(err);
          if (errMsg.toLowerCase().includes('interrupted') || errMsg.toLowerCase().includes('cancelled')) {
            throw new QueryCancelledException(`Aggregation query ${plan.queryId} was interrupted.`);
          }
          this.logger.error(`DuckDB aggregation failed for query ${plan.queryId}: ${errMsg}`);
          throw new DuckDbUnavailableException(`Analytical execution error: ${errMsg}`);
        } finally {
          try {
            conn.closeSync();
          } catch (closeErr: unknown) {
            const msg = closeErr instanceof Error ? closeErr.message : String(closeErr);
            this.logger.warn(`Error closing DuckDB connection for aggregation query ${plan.queryId}: ${msg}`);
          }
        }
      },
      signal,
    );
  }

  public async executeFacets(
    plan: AuthorizedFacetsPlan,
    signal?: AbortSignal,
  ): Promise<FacetsQueryResult> {
    const startTimeNs = process.hrtime.bigint();

    if (plan.descriptors.length === 0) {
      const facets: Record<string, FacetValueCount[]> = {};
      for (const f of plan.facetFields) {
        facets[f] = [];
      }
      return {
        facets,
        scannedBytes: 0,
        scannedSegments: 0,
        executionTimeMs: 0,
        archiveWatermark: new Date().toISOString(),
        tenantId: plan.tenantId,
        searchedProjects: plan.authorizedProjects,
      };
    }

    // MANDATORY SECURITY GATE P0-A: Pre-Read Tenant & Filesystem Isolation
    this.validateDescriptorProvenance(
      plan.descriptors,
      plan.tenantId,
      plan.authorizedProjects,
      'facets-actor',
      plan.queryId,
    );

    const totalScannedBytes = plan.descriptors.reduce((acc, d) => acc + d.byteSize, 0);
    const latestDate = plan.descriptors
      .map((d) => d.date)
      .sort()
      .pop() || new Date().toISOString();
    const archiveWatermark = latestDate.includes('T') ? latestDate : `${latestDate}T23:59:59.999Z`;

    return this.resourceGovernor.schedule(
      plan.queryId,
      plan.tenantId,
      plan.resourceBudget.timeoutMs,
      async (onAbort) => {
        const conn = await this.instanceManager.createConnection();

        onAbort(() => {
          try {
            this.logger.warn(`Triggering DuckDB connection interrupt for facets query ${plan.queryId}`);
            conn.interrupt();
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.warn(`Failed to interrupt DuckDB connection: ${msg}`);
          }
        });

        try {
          const results: Record<string, FacetValueCount[]> = {};

          for (const field of plan.facetFields) {
            const generated = this.analyticsSqlGenerator.generateFacetQuery(plan, field);
            const prep = await conn.prepare(generated.sql);

            try {
              this.bindPreparedStatement(prep, generated.parameters);
              const reader = await prep.run();
              const rows = await reader.getRows();

              results[field] = rows.map((r) => ({
                value: String(r[0] ?? ''),
                count: Number(r[1] ?? 0),
              }));
            } catch (err: unknown) {
              throw err;
            }
          }

          const durationMs = Number(process.hrtime.bigint() - startTimeNs) / 1_000_000;

          return {
            facets: results,
            scannedBytes: totalScannedBytes,
            scannedSegments: plan.descriptors.length,
            executionTimeMs: Math.round(durationMs),
            archiveWatermark,
            tenantId: plan.tenantId,
            searchedProjects: plan.authorizedProjects,
          };
        } catch (err: unknown) {
          if (err instanceof QueryTimeoutException || err instanceof QueryCancelledException) {
            throw err;
          }
          const errMsg = err instanceof Error ? err.message : String(err);
          if (errMsg.toLowerCase().includes('interrupted') || errMsg.toLowerCase().includes('cancelled')) {
            throw new QueryCancelledException(`Facets query ${plan.queryId} was interrupted.`);
          }
          this.logger.error(`DuckDB facets execution failed for query ${plan.queryId}: ${errMsg}`);
          throw new DuckDbUnavailableException(`Analytical execution error: ${errMsg}`);
        } finally {
          try {
            conn.closeSync();
          } catch (closeErr: unknown) {
            const msg = closeErr instanceof Error ? closeErr.message : String(closeErr);
            this.logger.warn(`Error closing DuckDB connection for facets query ${plan.queryId}: ${msg}`);
          }
        }
      },
      signal,
    );
  }

  private validateDescriptorProvenance(
    descriptors: readonly TrustedArchiveSegmentDescriptor[],
    tenantId: string,
    authorizedProjects: readonly string[],
    actorId?: string,
    correlationId?: string,
  ): void {
    for (const descriptor of descriptors) {
      if (descriptor.tenantId !== tenantId) {
        this.audit.recordSecurityEvent({
          eventType: 'CROSS_TENANT_REJECTED',
          principalId: actorId ?? 'system',
          tenantId,
          projects: authorizedProjects,
          correlationId,
          detail: `Pre-read security gate rejected foreign descriptor with tenant ${descriptor.tenantId}.`,
        });
        throw new CrossTenantViolationException(
          `Pre-read isolation violation: segment descriptor belongs to tenant "${descriptor.tenantId}", which does not match caller tenant "${tenantId}".`,
        );
      }

      if (!authorizedProjects.includes('*') && !authorizedProjects.includes(descriptor.projectId)) {
        this.audit.recordSecurityEvent({
          eventType: 'FORBIDDEN_SCOPE_REJECTED',
          principalId: actorId ?? 'system',
          tenantId,
          projects: authorizedProjects,
          correlationId,
          detail: `Pre-read security gate rejected descriptor with unauthorized project ${descriptor.projectId}.`,
        });
        throw new ForbiddenProjectException(
          `Pre-read isolation violation: segment descriptor belongs to project "${descriptor.projectId}", which is not in caller's authorized scope.`,
        );
      }

      if (descriptor.integrityStatus !== 'VERIFIED') {
        throw new ArchiveIntegrityException(
          `Pre-read security gate rejected unverified segment descriptor "${descriptor.segmentFilename}" (status: ${descriptor.integrityStatus}).`,
        );
      }

      if (!path.isAbsolute(descriptor.resolvedPath)) {
        throw new PathTraversalException(
          `Pre-read security gate rejected non-absolute segment path "${descriptor.resolvedPath}".`,
        );
      }

      if (!fs.existsSync(descriptor.resolvedPath)) {
        throw new ArchiveNotFoundException(
          `Pre-read security gate: referenced segment file does not exist on disk: ${descriptor.resolvedPath}`,
        );
      }

      try {
        const stat = fs.statSync(descriptor.resolvedPath);
        if (stat.size !== descriptor.byteSize) {
          throw new ArchiveIntegrityException(
            `Pre-read file identity mismatch for "${descriptor.segmentFilename}": expected ${descriptor.byteSize} bytes, found ${stat.size} bytes on disk.`,
          );
        }
      } catch (err: unknown) {
        if (err instanceof ArchiveIntegrityException) throw err;
        throw new ArchiveIntegrityException(
          `Pre-read revalidation failed for "${descriptor.segmentFilename}": ${String(err)}`,
        );
      }
    }
  }

  private bindPreparedStatement(
    prep: DuckDBPreparedStatement,
    parameters: readonly (string | number | bigint)[],
  ): void {
    for (let i = 0; i < parameters.length; i++) {
      const paramIdx = i + 1;
      const val = parameters[i];

      if (typeof val === 'bigint') {
        prep.bindBigInt(paramIdx, val);
      } else if (typeof val === 'number') {
        if (Number.isInteger(val)) {
          prep.bindBigInt(paramIdx, BigInt(val));
        } else {
          prep.bindDouble(paramIdx, val);
        }
      } else if (typeof val === 'boolean') {
        prep.bindBoolean(paramIdx, val);
      } else if (val === null || val === undefined) {
        prep.bindNull(paramIdx);
      } else {
        prep.bindVarchar(paramIdx, String(val));
      }
    }
  }
}
