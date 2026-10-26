import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Headers,
} from '@nestjs/common';
import { QueryAuthGuard } from '../../../common/guards/query-auth.guard.js';
import { CurrentPrincipal } from '../../../common/decorators/current-principal.decorator.js';
import type { QueryPrincipal } from '../../auth/domain/principal.model.js';
import { ArchiveDiscoveryService } from '../application/archive-discovery.service.js';
import { DiscoveryValidationPipe } from '../../../common/pipes/discovery-validation.pipe.js';
import type { DiscoverArchiveSegmentsRequestDto } from './dto/discovery-request.dto.js';
import type {
  DiscoverArchiveSegmentsResponseDto,
  DiscoveredSegmentSummaryDto,
} from './dto/discovery-response.dto.js';

@Controller('query/v1/archive')
export class ArchiveDiscoveryController {
  constructor(private readonly discoveryService: ArchiveDiscoveryService) {}

  @Post('discover')
  @HttpCode(HttpStatus.OK)
  @UseGuards(QueryAuthGuard)
  public async discoverSegments(
    @Body(DiscoveryValidationPipe) body: DiscoverArchiveSegmentsRequestDto,
    @CurrentPrincipal() principal: QueryPrincipal,
    @Headers('x-correlation-id') correlationId?: string,
  ): Promise<DiscoverArchiveSegmentsResponseDto> {
    const startTime = body.time_range?.start ? new Date(body.time_range.start) : undefined;
    const endTime = body.time_range?.end ? new Date(body.time_range.end) : undefined;

    const result = await this.discoveryService.discoverSegments(
      principal,
      {
        projects: body.projects,
        environments: body.environments,
        services: body.services,
        startDate: body.start_date,
        endDate: body.end_date,
        startTime,
        endTime,
        limit: body.limit,
      },
      correlationId,
    );

    // Sanitize descriptors for public response: do not expose server physical paths
    const publicSegments: DiscoveredSegmentSummaryDto[] = result.segments.map((s) => ({
      id: s.id,
      project_id: s.projectId,
      environment: s.environment,
      service_name: s.serviceName,
      date: s.date,
      segment_filename: s.segmentFilename,
      record_count: s.recordCount,
      byte_size: s.byteSize,
      sha256_checksum: s.sha256Checksum,
      first_event_timestamp: s.firstEventTimestamp,
      last_event_timestamp: s.lastEventTimestamp,
      finalized_at: s.finalizedAt,
      integrity_status: s.integrityStatus,
    }));

    return {
      meta: {
        tenant_id: result.tenantId,
        authorized_projects: result.authorizedProjects,
        total_discovered: result.totalDiscovered,
        verified_count: result.verifiedCount,
        missing_count: result.missingCount,
        corrupt_count: result.corruptCount,
        execution_time_ms: result.executionTimeMs,
      },
      segments: publicSegments,
    };
  }
}
