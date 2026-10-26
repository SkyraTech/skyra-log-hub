import { Injectable, Inject, Logger } from '@nestjs/common';
import type { QueryPrincipal } from '../../auth/domain/principal.model.js';
import type { SearchRequestDto } from '../api/dto/search-request.dto.js';
import type { SearchResponseDto } from '../api/dto/search-response.dto.js';
import { QueryPlannerService } from '../../query-execution/application/query-planner.service.js';
import {
  LOG_QUERY_EXECUTION_PORT,
  type ILogQueryExecutionPort,
} from '../../query-execution/domain/query-execution.port.js';
import { CursorCodecService } from './cursor-codec.service.js';
import { SearchResponseMapper } from './search-response.mapper.js';
import { QueryAuditService } from '../../audit/query-audit.service.js';
import type { StableCursorPosition } from '../../query-execution/domain/authorized-query-plan.model.js';

@Injectable()
export class SearchLogsUseCase {
  private readonly logger = new Logger(SearchLogsUseCase.name);

  constructor(
    private readonly planner: QueryPlannerService,
    @Inject(LOG_QUERY_EXECUTION_PORT)
    private readonly executionPort: ILogQueryExecutionPort,
    private readonly cursorCodec: CursorCodecService,
    private readonly responseMapper: SearchResponseMapper,
    private readonly audit: QueryAuditService,
  ) {}

  public async execute(
    principal: QueryPrincipal,
    request: SearchRequestDto,
    correlationId?: string,
    signal?: AbortSignal,
  ): Promise<SearchResponseDto> {
    const sortDirection = request.sort?.direction ?? 'desc';

    // 1. Compute stable query fingerprint for cursor validation & continuation
    const queryFingerprint = this.cursorCodec.computeQueryFingerprint({
      time_range: request.time_range,
      projects: request.projects,
      environments: request.environments,
      services: request.services,
      levels: request.levels,
      query_text: request.query_text,
      trace_id: request.trace_id,
      event_id: request.event_id,
      filters: request.filters,
      sort_direction: sortDirection,
    });

    // 2. Decode & verify cursor if supplied
    let cursorPosition: StableCursorPosition | undefined;
    if (request.cursor) {
      cursorPosition = this.cursorCodec.decode({
        encodedCursor: request.cursor,
        expectedTenantId: principal.tenantId,
        expectedQueryFingerprint: queryFingerprint,
        expectedSortDirection: sortDirection,
        correlationId,
        principalId: principal.sub,
      });
    }

    // 3. Plan query with pre-read authorization boundaries and extra row lookahead
    const plan = await this.planner.planQuery(
      principal,
      {
        time_range: request.time_range,
        projects: request.projects,
        environments: request.environments,
        services: request.services,
        levels: request.levels,
        query_text: request.query_text,
        trace_id: request.trace_id,
        event_id: request.event_id,
        filters: request.filters,
        sort: {
          field: request.sort?.field ?? '@timestamp',
          direction: sortDirection,
        },
        limit: request.limit ?? 50,
        cursorPosition,
        fetchExtraRow: true,
      },
      correlationId,
    );

    // 4. Execute analytical query across authorized archives
    const result = await this.executionPort.execute(plan, signal);

    // 5. Map response and issue signed next cursor if more records exist
    const response = this.responseMapper.map({
      result,
      plan,
      queryFingerprint,
      sortDirection,
    });

    // 6. Record safe operational audit
    this.audit.recordSecurityEvent({
      eventType: 'SEARCH_EXECUTED',
      principalId: principal.sub,
      tenantId: principal.tenantId,
      projects: plan.authorizedProjects,
      correlationId,
      durationMs: result.executionDurationMs,
      detail: `Search query ${plan.queryId} returned ${response.pagination.total_returned} logs (has_more=${response.pagination.has_more}) across ${result.scannedSegmentCount} segments (${result.scannedBytes} bytes).`,
    });

    return response;
  }
}
