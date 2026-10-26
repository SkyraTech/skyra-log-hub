import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  ARCHIVE_SEGMENT_REPOSITORY,
  type IArchiveSegmentRepository,
  type ArchiveSegmentRecord,
} from '../domain/archive-segment.repository.interface.js';
import type { TrustedArchiveSegmentDescriptor } from '../domain/archive-segment-descriptor.model.js';
import { PathSafetyService } from '../infrastructure/path-safety.service.js';
import { ManifestVerifierService } from './manifest-verifier.service.js';
import {
  PROJECT_AUTHORIZATION_PORT,
  type IProjectAuthorizationPort,
} from '../../auth/authorization/project-authorization.port.js';
import type { QueryPrincipal } from '../../auth/domain/principal.model.js';
import { QueryConfigService } from '../../../config/query-config.service.js';
import { QueryAuditService } from '../../audit/query-audit.service.js';
import {
  InvalidArgumentException,
  TimeRangeExceededException,
} from '../../../common/errors/query.errors.js';

export interface DiscoverSegmentsFilter {
  readonly projects?: readonly string[];
  readonly environments?: readonly string[];
  readonly services?: readonly string[];
  readonly startDate?: string; // YYYY-MM-DD
  readonly endDate?: string;   // YYYY-MM-DD
  readonly startTime?: Date;
  readonly endTime?: Date;
  readonly limit?: number;
}

export interface ArchiveDiscoveryResult {
  readonly tenantId: string;
  readonly authorizedProjects: readonly string[];
  readonly totalDiscovered: number;
  readonly verifiedCount: number;
  readonly missingCount: number;
  readonly corruptCount: number;
  readonly segments: readonly TrustedArchiveSegmentDescriptor[];
  readonly executionTimeMs: number;
}

@Injectable()
export class ArchiveDiscoveryService {
  private readonly logger = new Logger(ArchiveDiscoveryService.name);

  constructor(
    @Inject(ARCHIVE_SEGMENT_REPOSITORY)
    private readonly segmentRepo: IArchiveSegmentRepository,
    @Inject(PROJECT_AUTHORIZATION_PORT)
    private readonly authPort: IProjectAuthorizationPort,
    private readonly pathSafety: PathSafetyService,
    private readonly manifestVerifier: ManifestVerifierService,
    private readonly config: QueryConfigService,
    private readonly audit: QueryAuditService,
  ) {}

  public async discoverSegments(
    principal: QueryPrincipal,
    filter: DiscoverSegmentsFilter,
    correlationId?: string,
  ): Promise<ArchiveDiscoveryResult> {
    const startTimeNs = process.hrtime.bigint();

    // 1. Authorize project scope (Fail-closed)
    const scope = await this.authPort.resolveAuthorizedProjects(principal, filter.projects);

    // 2. Validate time boundaries if provided
    if (filter.startTime && filter.endTime) {
      if (filter.endTime <= filter.startTime) {
        throw new InvalidArgumentException('Search time_range "end" must be strictly greater than "start".');
      }

      const diffDays = (filter.endTime.getTime() - filter.startTime.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays > this.config.maxTimeRangeDays) {
        throw new TimeRangeExceededException(this.config.maxTimeRangeDays);
      }
    }

    if (filter.startDate && filter.endDate && filter.endDate < filter.startDate) {
      throw new InvalidArgumentException('Filter "endDate" cannot precede "startDate".');
    }

    // 3. Query approved archive metadata records
    const rawSegments = await this.segmentRepo.findSegments({
      tenantId: scope.tenantId,
      projectIds: scope.effectiveProjects,
      environments: filter.environments,
      serviceNames: filter.services,
      startDate: filter.startDate,
      endDate: filter.endDate,
      startTime: filter.startTime,
      endTime: filter.endTime,
      limit: filter.limit ?? this.config.maxSegmentsPerQuery,
    });

    const nowIso = new Date().toISOString();
    const verifiedDescriptors: TrustedArchiveSegmentDescriptor[] = [];
    let verifiedCount = 0;
    let missingCount = 0;
    let corruptCount = 0;

    // 4. Validate filesystem containment and manifest integrity for each segment
    for (const record of rawSegments) {
      const resolvedPath = this.pathSafety.resolveAndValidateSegmentPath(
        record.tenantId,
        record.projectId,
        record.environment,
        record.serviceName,
        record.date,
        record.segmentFilename,
      );

      const verification = await this.manifestVerifier.verifySegmentAndManifest(
        resolvedPath,
        record.sha256Checksum,
        Number(record.byteSize),
      );

      if (verification.status === 'VERIFIED') {
        verifiedCount++;
      } else if (verification.status === 'MISSING') {
        missingCount++;
        this.audit.recordSecurityEvent({
          eventType: 'ARCHIVE_INTEGRITY_VIOLATION',
          principalId: principal.sub,
          tenantId: scope.tenantId,
          projects: [record.projectId],
          correlationId,
          detail: `Segment file in metadata catalog is missing on disk: ${resolvedPath}`,
        });
      } else {
        corruptCount++;
        this.audit.recordSecurityEvent({
          eventType: 'ARCHIVE_INTEGRITY_VIOLATION',
          principalId: principal.sub,
          tenantId: scope.tenantId,
          projects: [record.projectId],
          correlationId,
          detail: `Segment integrity mismatch for ${resolvedPath}: ${verification.reason}`,
        });
      }

      verifiedDescriptors.push({
        id: record.id,
        tenantId: record.tenantId,
        projectId: record.projectId,
        environment: record.environment,
        serviceName: record.serviceName,
        date: record.date,
        segmentFilename: record.segmentFilename,
        resolvedPath,
        recordCount: record.recordCount,
        byteSize: Number(record.byteSize),
        sha256Checksum: record.sha256Checksum,
        firstEventTimestamp: record.firstEventTimestamp.toISOString(),
        lastEventTimestamp: record.lastEventTimestamp.toISOString(),
        finalizedAt: record.finalizedAt.toISOString(),
        verifiedAt: nowIso,
        integrityStatus: verification.status,
      });
    }

    const durationMs = Number(process.hrtime.bigint() - startTimeNs) / 1_000_000;

    this.audit.recordSecurityEvent({
      eventType: 'DISCOVERY_COMPLETED',
      principalId: principal.sub,
      tenantId: scope.tenantId,
      projects: scope.effectiveProjects,
      correlationId,
      durationMs,
      detail: `Archive discovery found ${verifiedDescriptors.length} segments (${verifiedCount} verified, ${missingCount} missing, ${corruptCount} corrupt).`,
    });

    return {
      tenantId: scope.tenantId,
      authorizedProjects: scope.effectiveProjects,
      totalDiscovered: verifiedDescriptors.length,
      verifiedCount,
      missingCount,
      corruptCount,
      segments: verifiedDescriptors,
      executionTimeMs: Math.round(durationMs),
    };
  }
}
