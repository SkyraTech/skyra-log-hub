import { Injectable, Inject, Logger } from '@nestjs/common';
import * as crypto from 'node:crypto';
import type { QueryPrincipal } from '../../auth/domain/principal.model.js';
import {
  ArchiveDiscoveryService,
  type DiscoverSegmentsFilter,
} from '../../archive-discovery/application/archive-discovery.service.js';
import {
  PROJECT_AUTHORIZATION_PORT,
  type IProjectAuthorizationPort,
} from '../../auth/authorization/project-authorization.port.js';
import { QueryConfigService } from '../../../config/query-config.service.js';
import { QueryAuditService } from '../../audit/query-audit.service.js';
import { FilterCompilerService } from './filter-compiler.service.js';
import type { RawFilterInput } from '../domain/query-filter.model.js';
import type {
  AuthorizedLogQueryPlan,
  QuerySortSpecification,
} from '../domain/authorized-query-plan.model.js';
import {
  InvalidArgumentException,
  TimeRangeExceededException,
  QueryBudgetExceededException,
} from '../../../common/errors/query.errors.js';

export interface PlanQueryRequest {
  readonly time_range: {
    readonly start: string;
    readonly end: string;
  };
  readonly projects?: readonly string[];
  readonly environments?: readonly string[];
  readonly services?: readonly string[];
  readonly levels?: readonly string[];
  readonly query_text?: string;
  readonly trace_id?: string;
  readonly event_id?: string;
  readonly filters?: readonly RawFilterInput[];
  readonly sort?: {
    readonly field?: string;
    readonly direction?: 'asc' | 'desc';
  };
  readonly limit?: number;
  readonly cursorPosition?: {
    readonly timestamp: string;
    readonly eventId: string;
    readonly segmentId: string;
    readonly recordOffset: number;
  };
  readonly fetchExtraRow?: boolean;
}

@Injectable()
export class QueryPlannerService {
  private readonly logger = new Logger(QueryPlannerService.name);

  constructor(
    private readonly discoveryService: ArchiveDiscoveryService,
    @Inject(PROJECT_AUTHORIZATION_PORT)
    private readonly authPort: IProjectAuthorizationPort,
    private readonly filterCompiler: FilterCompilerService,
    private readonly config: QueryConfigService,
    private readonly audit: QueryAuditService,
  ) {}

  public async planQuery(
    principal: QueryPrincipal,
    request: PlanQueryRequest,
    correlationId?: string,
  ): Promise<AuthorizedLogQueryPlan> {
    const queryId = crypto.randomUUID();

    // 1. Validate time boundaries
    if (!request.time_range || !request.time_range.start || !request.time_range.end) {
      throw new InvalidArgumentException('Query request must specify "time_range.start" and "time_range.end".');
    }

    const startTime = new Date(request.time_range.start);
    const endTime = new Date(request.time_range.end);

    if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
      throw new InvalidArgumentException('"time_range" timestamps must be valid ISO 8601 UTC strings.');
    }

    if (endTime <= startTime) {
      throw new InvalidArgumentException('Search time_range "end" must be strictly greater than "start".');
    }

    const diffDays = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays > this.config.maxTimeRangeDays) {
      throw new TimeRangeExceededException(this.config.maxTimeRangeDays);
    }

    // 2. Authorize project scope (Fail-closed)
    const scope = await this.authPort.resolveAuthorizedProjects(principal, request.projects);

    // 3. Discover eligible segments via ArchiveDiscoveryService
    const discoveryFilter: DiscoverSegmentsFilter = {
      projects: scope.effectiveProjects,
      environments: request.environments,
      services: request.services,
      startTime,
      endTime,
      limit: this.config.maxSegmentsPerQuery + 1, // Look ahead to detect budget overflow
    };

    const discovery = await this.discoveryService.discoverSegments(
      principal,
      discoveryFilter,
      correlationId,
    );

    // Filter to VERIFIED descriptors only
    const verifiedDescriptors = discovery.segments.filter((s) => s.integrityStatus === 'VERIFIED');

    // 4. Resource budget enforcement
    if (verifiedDescriptors.length > this.config.maxSegmentsPerQuery) {
      throw new QueryBudgetExceededException(
        `Query requires ${verifiedDescriptors.length} segments, exceeding the maximum budget limit of ${this.config.maxSegmentsPerQuery} segments. Narrow your time range or project filter.`,
      );
    }

    const totalScannedBytes = verifiedDescriptors.reduce((acc, seg) => acc + seg.byteSize, 0);
    if (totalScannedBytes > this.config.maxScannedBytesPerQuery) {
      throw new QueryBudgetExceededException(
        `Estimated scanned archive size of ${totalScannedBytes} bytes exceeds the resource budget ceiling of ${this.config.maxScannedBytesPerQuery} bytes.`,
      );
    }

    // 5. Combine and compile structured filters
    const combinedFilters: RawFilterInput[] = [];

    if (request.services && request.services.length > 0) {
      combinedFilters.push({
        field: 'service.name',
        operator: 'in',
        value: [...request.services],
      });
    }

    if (request.levels && request.levels.length > 0) {
      combinedFilters.push({
        field: 'log.level',
        operator: 'in',
        value: [...request.levels],
      });
    }

    if (request.query_text && request.query_text.trim().length > 0) {
      combinedFilters.push({
        field: 'message',
        operator: 'contains',
        value: request.query_text.trim(),
      });
    }

    if (request.trace_id) {
      combinedFilters.push({
        field: 'trace.id',
        operator: 'eq',
        value: request.trace_id,
      });
    }

    if (request.event_id) {
      combinedFilters.push({
        field: 'event.id',
        operator: 'eq',
        value: request.event_id,
      });
    }

    if (request.filters && request.filters.length > 0) {
      combinedFilters.push(...request.filters);
    }

    const compiledFilter = this.filterCompiler.compileFilters(combinedFilters);

    // 6. Sort specification
    const sortField = request.sort?.field ?? '@timestamp';
    if (sortField !== '@timestamp' && sortField !== 'timestamp') {
      throw new InvalidArgumentException(
        `Sorting by field "${sortField}" is not supported. Sorting is restricted to "@timestamp".`,
      );
    }

    const sort: QuerySortSpecification = {
      field: '@timestamp',
      direction: request.sort?.direction === 'asc' ? 'asc' : 'desc',
    };

    // 7. Bounded limit
    const requestedLimit = request.limit ?? 50;
    if (requestedLimit < 1) {
      throw new InvalidArgumentException('Query limit must be an integer greater than or equal to 1.');
    }
    const limit = Math.min(requestedLimit, this.config.maxRowsPerQuery);

    const plan: AuthorizedLogQueryPlan = {
      queryId,
      tenantId: scope.tenantId,
      authorizedProjects: scope.effectiveProjects,
      environmentScopes: request.environments,
      descriptors: verifiedDescriptors,
      timeInterval: {
        startInclusive: startTime.toISOString(),
        endExclusive: endTime.toISOString(),
      },
      filter: compiledFilter,
      sort,
      limit,
      resourceBudget: {
        maxSegments: this.config.maxSegmentsPerQuery,
        maxScannedBytes: this.config.maxScannedBytesPerQuery,
        maxRows: this.config.maxRowsPerQuery,
        timeoutMs: this.config.queryTimeoutMs,
        memoryBudgetMb: this.config.duckDbMaxMemoryMb,
      },
      cursorPosition: request.cursorPosition,
      fetchExtraRow: request.fetchExtraRow,
      correlationId,
      actorId: principal.sub,
    };

    this.audit.recordSecurityEvent({
      eventType: 'QUERY_PLAN_CONSTRUCTED',
      principalId: principal.sub,
      tenantId: scope.tenantId,
      projects: scope.effectiveProjects,
      correlationId,
      detail: `Planned query ${queryId} across ${verifiedDescriptors.length} segments (${totalScannedBytes} bytes).`,
    });

    return plan;
  }
}
