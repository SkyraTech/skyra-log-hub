import { Injectable, Inject, Logger } from '@nestjs/common';
import type { QueryPrincipal } from '../../auth/domain/principal.model.js';
import type { FacetsRequestDto } from '../api/dto/facets-request.dto.js';
import type { FacetsResponseDto } from '../api/dto/facets-response.dto.js';
import { QueryPlannerService } from '../../query-execution/application/query-planner.service.js';
import {
  LOG_QUERY_EXECUTION_PORT,
  type ILogQueryExecutionPort,
} from '../../query-execution/domain/query-execution.port.js';
import { AnalyticsResponseMapper } from './analytics-response.mapper.js';
import { QueryAuditService } from '../../audit/query-audit.service.js';
import { QueryTimeoutException } from '../../../common/errors/query.errors.js';

@Injectable()
export class DiscoverFacetsUseCase {
  private readonly logger = new Logger(DiscoverFacetsUseCase.name);

  constructor(
    private readonly planner: QueryPlannerService,
    @Inject(LOG_QUERY_EXECUTION_PORT)
    private readonly executionPort: ILogQueryExecutionPort,
    private readonly mapper: AnalyticsResponseMapper,
    private readonly audit: QueryAuditService,
  ) {}

  public async execute(
    principal: QueryPrincipal,
    dto: FacetsRequestDto,
    correlationId?: string,
    signal?: AbortSignal,
  ): Promise<FacetsResponseDto> {
    const startTimeNs = process.hrtime.bigint();

    this.audit.recordSecurityEvent({
      eventType: 'FACETS_REQUESTED',
      principalId: principal.sub,
      tenantId: principal.tenantId,
      projects: principal.authorizedProjects,
      correlationId,
      detail: `Facet discovery requested for fields: ${dto.facet_fields.join(', ')}`,
      metadata: {
        facetFields: dto.facet_fields,
        time_range: dto.time_range,
      },
    });

    try {
      const plan = await this.planner.planFacets(principal, dto, correlationId);
      const queryResult = await this.executionPort.executeFacets(plan, signal);
      const responseDto = this.mapper.mapFacetsResult(queryResult);

      const durationMs = Number(process.hrtime.bigint() - startTimeNs) / 1_000_000;

      this.audit.recordSecurityEvent({
        eventType: 'FACETS_COMPLETED',
        principalId: principal.sub,
        tenantId: principal.tenantId,
        projects: queryResult.searchedProjects,
        correlationId,
        durationMs: Math.round(durationMs),
        detail: `Facets discovered successfully for ${Object.keys(responseDto.facets).length} fields.`,
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
        detail: `Facets discovery failed: ${err instanceof Error ? err.message : String(err)}`,
      });

      throw err;
    }
  }
}
