import * as fs from 'node:fs';
import * as path from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import type { ILogQueryExecutionPort } from '../../domain/query-execution.port.js';
import type { AuthorizedLogQueryPlan, StableCursorPosition } from '../../domain/authorized-query-plan.model.js';
import type {
  BoundedLogQueryResult,
  CanonicalLogEventRecord,
} from '../../domain/bounded-query-result.model.js';
import { DuckDbInstanceManager } from './duckdb-instance.manager.js';
import { SqlGeneratorService } from '../../application/sql-generator.service.js';
import { QueryResourceGovernorService } from './query-resource-governor.service.js';
import { QueryAuditService } from '../../../audit/query-audit.service.js';
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

  constructor(
    private readonly instanceManager: DuckDbInstanceManager,
    private readonly sqlGenerator: SqlGeneratorService,
    private readonly resourceGovernor: QueryResourceGovernorService,
    private readonly audit: QueryAuditService,
  ) {}

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
    // Every single segment descriptor is validated BEFORE DuckDB opens or executes any file.
    for (const descriptor of plan.descriptors) {
      // 1. Tenant ownership validation
      if (descriptor.tenantId !== plan.tenantId) {
        this.audit.recordSecurityEvent({
          eventType: 'CROSS_TENANT_REJECTED',
          principalId: plan.actorId ?? 'system',
          tenantId: plan.tenantId,
          projects: plan.authorizedProjects,
          correlationId: plan.correlationId,
          detail: `Pre-read security gate rejected foreign descriptor with tenant ${descriptor.tenantId}.`,
        });
        throw new CrossTenantViolationException(
          `Pre-read isolation violation: segment descriptor belongs to tenant "${descriptor.tenantId}", which does not match caller tenant "${plan.tenantId}".`,
        );
      }

      // 2. Project membership validation
      if (!plan.authorizedProjects.includes(descriptor.projectId)) {
        this.audit.recordSecurityEvent({
          eventType: 'FORBIDDEN_SCOPE_REJECTED',
          principalId: plan.actorId ?? 'system',
          tenantId: plan.tenantId,
          projects: plan.authorizedProjects,
          correlationId: plan.correlationId,
          detail: `Pre-read security gate rejected descriptor with unauthorized project ${descriptor.projectId}.`,
        });
        throw new ForbiddenProjectException(
          `Pre-read isolation violation: segment descriptor belongs to project "${descriptor.projectId}", which is not in caller's authorized scope.`,
        );
      }

      // 3. Manifest integrity status verification
      if (descriptor.integrityStatus !== 'VERIFIED') {
        throw new ArchiveIntegrityException(
          `Pre-read security gate rejected unverified segment descriptor "${descriptor.segmentFilename}" (status: ${descriptor.integrityStatus}).`,
        );
      }

      // 4. Absolute path validation
      if (!path.isAbsolute(descriptor.resolvedPath)) {
        throw new PathTraversalException(
          `Pre-read security gate rejected non-absolute segment path "${descriptor.resolvedPath}".`,
        );
      }

      // 5. File existence verification
      if (!fs.existsSync(descriptor.resolvedPath)) {
        throw new ArchiveNotFoundException(
          `Pre-read security gate: referenced segment file does not exist on disk: ${descriptor.resolvedPath}`,
        );
      }

      // 6. Near-execution file identity & byte-size revalidation (prevents file tampering / race conditions)
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

          // Parameter binding
          for (let i = 0; i < generated.parameters.length; i++) {
            const paramIdx = i + 1;
            const val = generated.parameters[i];

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

          const reader = await prep.run();
          const rows = await reader.getRows();

          const parsedRows: RawRowResult[] = [];
          for (const row of rows) {
            // row: ["@timestamp", "event.id", "segment_id", "record_offset", json]
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
                const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
                this.logger.warn(`Failed to parse canonical JSON record for query ${plan.queryId}: ${msg}`);
              }
            }
          }

          // Evaluate pagination limit and extra row lookahead
          const hasMore = plan.fetchExtraRow ? parsedRows.length > plan.limit : false;
          const returnedRows = hasMore ? parsedRows.slice(0, plan.limit) : parsedRows;
          const events = returnedRows.map((r) => r.event);

          let lastPosition: StableCursorPosition | undefined;
          if (returnedRows.length > 0) {
            const lastRow = returnedRows[returnedRows.length - 1];
            if (lastRow) {
              lastPosition = {
                timestamp: lastRow.timestamp,
                eventId: lastRow.eventId,
                segmentId: lastRow.segmentId,
                recordOffset: lastRow.recordOffset,
              };
            }
          }

          const durationMs = Number(process.hrtime.bigint() - startTimeNs) / 1_000_000;

          this.audit.recordSecurityEvent({
            eventType: 'QUERY_EXECUTED',
            principalId: plan.actorId ?? 'system',
            tenantId: plan.tenantId,
            projects: plan.authorizedProjects,
            correlationId: plan.correlationId,
            durationMs: Math.round(durationMs),
            detail: `Query ${plan.queryId} returned ${events.length} rows from ${plan.descriptors.length} segments (${totalScannedBytes} bytes).`,
          });

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
}
