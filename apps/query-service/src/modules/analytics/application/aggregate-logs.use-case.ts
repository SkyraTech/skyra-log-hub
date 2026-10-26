import { Injectable, Inject, Logger } from '@nestjs/common';
import type { QueryPrincipal } from '../../auth/domain/principal.model.js';
import type { AggregateRequestDto } from '../api/dto/aggregate-request.dto.js';
import type { AggregateResponseDto } from '../api/dto/aggregate-response.dto.js';
import { QueryPlannerService } from '../../query-execution/application/query-planner.service.js';
import {
  LOG_QUERY_EXECUTION_PORT,
  type ILogQueryExecutionPort,
} from '../../query-execution/domain/query-execution.port.js';
import { AnalyticsResponseMapper } from './analytics-response.mapper.js';
import { QueryAuditService } from '../../audit/query-audit.service.js';
import { QueryTimeoutException } from '../../../common/errors/query.errors.js';

@Injectable()
export class AggregateLogsUseCase {
  private readonly logger = new Logger(AggregateLogsUseCase.name);

  constructor(
    private readonly planner: QueryPlannerService,
    @Inject(LOG_QUERY_EXECUTION_PORT)
    private readonly executionPort: ILogQueryExecutionPort,
    private readonly mapper: AnalyticsResponseMapper,
    private readonly audit: QueryAuditService,
  ) {}

  public async execute(
    principal: QueryPrincipal,
    dto: AggregateRequestDto,
    correlationId?: string,
    signal?: AbortSignal,
  ): Promise<AggregateResponseDto> {
    const startTimeNs = process.hrtime.bigint();

    this.audit.recordSecurityEvent({
      eventType: 'AGGREGATION_REQUESTED',
      principalId: principal.sub,
      tenantId: principal.tenantId,
      projects: principal.authorizedProjects,
      correlationId,
      detail: `Aggregation requested with ${dto.aggregations.length} aggregations: ${dto.aggregations.map((a) => a.name).join(', ')}`,
      metadata: {
        aggregationCount: dto.aggregations.length,
        aggregationNames: dto.aggregations.map((a) => a.name),
        time_range: dto.time_range,
      },
    });

    try {
      const plan = await this.planner.planAggregation(principal, dto, correlationId);
      const queryResult = await this.executionPort.executeAggregation(plan, signal);
      const responseDto = this.mapper.mapAggregationResult(queryResult);

      const durationMs = Number(process.hrtime.bigint() - startTimeNs) / 1_000_000;

      this.audit.recordSecurityEvent({
        eventType: 'AGGREGATION_COMPLETED',
        principalId: principal.sub,
        tenantId: principal.tenantId,
        projects: queryResult.searchedProjects,
        correlationId,
        durationMs: Math.round(durationMs),
        detail: `Aggregation executed successfully: ${Object.keys(responseDto.aggregations).length} aggregation results produced.`,
        metadata: {
          scannedSegments: queryResult.scannedSegments,
          scannedBytes: queryResult.scannedBytes,
          executionTimeMs: queryResult.executionTimeMs,
        },
      });

      return responseDto;
    } catch (err: unknown) {
      const durationMs = Number(process.hrtime.bigint() - startTimeNs) / 1_000_000;
      const isTimeout = err instanceof QueryTimeoutException;

      this.audit.recordSecurityEvent({
        eventType: isTimeout ? 'ANALYTICS_TIMEOUT' : 'ANALYTICS_REJECTED',
        principalId: principal.sub,
        tenantId: principal.tenantId,
        projects: principal.authorizedProjects,
        correlationId,
        durationMs: Math.round(durationMs),
        detail: `Aggregation failed: ${err instanceof Error ? err.message : String(err)}`,
      });

      throw err;
    }
  }
}
