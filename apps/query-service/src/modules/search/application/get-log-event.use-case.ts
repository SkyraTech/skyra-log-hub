import { Injectable, Inject, Logger } from '@nestjs/common';
import type { QueryPrincipal } from '../../auth/domain/principal.model.js';
import {
  PROJECT_AUTHORIZATION_PORT,
  type IProjectAuthorizationPort,
} from '../../auth/authorization/project-authorization.port.js';
import { QueryPlannerService } from '../../query-execution/application/query-planner.service.js';
import {
  LOG_QUERY_EXECUTION_PORT,
  type ILogQueryExecutionPort,
} from '../../query-execution/domain/query-execution.port.js';
import { QueryAuditService } from '../../audit/query-audit.service.js';
import {
  LogEventNotFoundException,
  ForbiddenProjectException,
} from '../../../common/errors/query.errors.js';

export interface GetLogEventParams {
  readonly eventId: string;
  readonly projectId: string;
  readonly date?: string;
  readonly correlationId?: string;
}

@Injectable()
export class GetLogEventUseCase {
  private readonly logger = new Logger(GetLogEventUseCase.name);

  constructor(
    @Inject(PROJECT_AUTHORIZATION_PORT)
    private readonly authPort: IProjectAuthorizationPort,
    private readonly planner: QueryPlannerService,
    @Inject(LOG_QUERY_EXECUTION_PORT)
    private readonly executionPort: ILogQueryExecutionPort,
    private readonly audit: QueryAuditService,
  ) {}

  public async execute(
    principal: QueryPrincipal,
    params: GetLogEventParams,
  ): Promise<Record<string, unknown>> {
    const { eventId, projectId, date, correlationId } = params;

    // 1. Authorize project scope (Fail closed)
    const scope = await this.authPort.resolveAuthorizedProjects(principal, [projectId]);
    if (!scope.effectiveProjects.includes(projectId)) {
      throw new ForbiddenProjectException(
        `Principal lacks authorized access to requested project "${projectId}".`,
      );
    }

    // 2. Establish bounded time boundaries (Never unrestricted scan)
    let startTime: Date;
    let endTime: Date;

    if (date) {
      startTime = new Date(`${date}T00:00:00.000Z`);
      endTime = new Date(startTime.getTime() + 24 * 60 * 60 * 1000);
    } else {
      // Default to 30-day bounded search window ending now
      endTime = new Date();
      startTime = new Date(endTime.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // 3. Plan query bounded to 2 records for deterministic deduplication
    const plan = await this.planner.planQuery(
      principal,
      {
        time_range: {
          start: startTime.toISOString(),
          end: endTime.toISOString(),
        },
        projects: [projectId],
        event_id: eventId,
        limit: 2,
        sort: {
          field: '@timestamp',
          direction: 'desc',
        },
      },
      correlationId,
    );

    // 4. Execute analytical point lookup
    const result = await this.executionPort.execute(plan);

    if (result.events.length === 0) {
      throw new LogEventNotFoundException(
        `Log event "${eventId}" was not found in project "${projectId}".`,
      );
    }

    // Deterministic tie-breaker: return latest record by @timestamp DESC
    const matchedEvent = result.events[0] as unknown as Record<string, unknown>;

    this.audit.recordSecurityEvent({
      eventType: 'EVENT_LOOKUP',
      principalId: principal.sub,
      tenantId: principal.tenantId,
      projects: [projectId],
      correlationId,
      detail: `Point-lookup for event "${eventId}" in project "${projectId}" succeeded.`,
    });

    return matchedEvent;
  }
}
