import { Injectable, Logger } from '@nestjs/common';
import type { ILogQueryExecutionPort } from '../../domain/query-execution.port.js';
import type { AuthorizedLogQueryPlan } from '../../domain/authorized-query-plan.model.js';
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
} from '../../../../common/errors/query.errors.js';

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
      };
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

          const events: CanonicalLogEventRecord[] = [];
          for (const row of rows) {
            const jsonCol = row[2];
            if (typeof jsonCol === 'string') {
              try {
                events.push(JSON.parse(jsonCol) as CanonicalLogEventRecord);
              } catch (parseErr: unknown) {
                const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
                this.logger.warn(`Failed to parse canonical JSON record for query ${plan.queryId}: ${msg}`);
              }
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

          return {
            queryId: plan.queryId,
            events,
            matchedCount: events.length,
            scannedSegmentCount: plan.descriptors.length,
            scannedBytes: totalScannedBytes,
            executionDurationMs: Math.round(durationMs),
            timeInterval: plan.timeInterval,
            truncated: events.length >= generated.limit,
            tieBreakerApplied: true,
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
