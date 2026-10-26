import { Injectable } from '@nestjs/common';
import type { ArchiveSegment } from '@prisma/client';
import { PrismaService } from '../../../metadata/prisma.service.js';
import type {
  IArchiveSegmentRepository,
  ArchiveSegmentRecord,
  ArchiveSegmentQueryCriteria,
} from '../domain/archive-segment.repository.interface.js';

@Injectable()
export class PrismaArchiveSegmentRepository implements IArchiveSegmentRepository {
  constructor(private readonly prisma: PrismaService) {}

  public async findSegments(criteria: ArchiveSegmentQueryCriteria): Promise<ArchiveSegmentRecord[]> {
    const whereClause: Record<string, unknown> = {
      tenantId: criteria.tenantId,
    };

    if (criteria.projectIds.length > 0 && !criteria.projectIds.includes('*')) {
      whereClause['projectId'] = { in: [...criteria.projectIds] };
    }

    if (criteria.environments && criteria.environments.length > 0) {
      whereClause['environment'] = { in: [...criteria.environments] };
    }

    if (criteria.serviceNames && criteria.serviceNames.length > 0) {
      whereClause['serviceName'] = { in: [...criteria.serviceNames] };
    }

    if (criteria.startDate || criteria.endDate) {
      const dateFilter: Record<string, string> = {};
      if (criteria.startDate) dateFilter['gte'] = criteria.startDate;
      if (criteria.endDate) dateFilter['lte'] = criteria.endDate;
      whereClause['date'] = dateFilter;
    }

    if (criteria.startTime) {
      whereClause['lastEventTimestamp'] = { gte: criteria.startTime };
    }

    if (criteria.endTime) {
      whereClause['firstEventTimestamp'] = { lt: criteria.endTime };
    }

    const rawList = await this.prisma.archiveSegment.findMany({
      where: whereClause,
      orderBy: [
        { firstEventTimestamp: 'asc' },
        { segmentFilename: 'asc' },
      ],
      take: criteria.limit && criteria.limit > 0 ? criteria.limit : 500,
    });

    return rawList.map((raw: ArchiveSegment) => ({
      id: raw.id,
      tenantId: raw.tenantId,
      projectId: raw.projectId,
      environment: raw.environment,
      serviceName: raw.serviceName,
      date: raw.date,
      segmentFilename: raw.segmentFilename,
      recordCount: raw.recordCount,
      byteSize: raw.byteSize,
      sha256Checksum: raw.sha256Checksum,
      firstEventTimestamp: raw.firstEventTimestamp,
      lastEventTimestamp: raw.lastEventTimestamp,
      finalizedAt: raw.finalizedAt,
      writerInstanceId: raw.writerInstanceId,
      journalSegmentId: raw.journalSegmentId,
      journalStartOffset: raw.journalStartOffset,
      journalEndOffset: raw.journalEndOffset,
    }));
  }

  public async findSegment(
    tenantId: string,
    projectId: string,
    environment: string,
    serviceName: string,
    date: string,
    segmentFilename: string,
  ): Promise<ArchiveSegmentRecord | null> {
    const raw = await this.prisma.archiveSegment.findUnique({
      where: {
        tenantId_projectId_environment_serviceName_date_segmentFilename: {
          tenantId,
          projectId,
          environment,
          serviceName,
          date,
          segmentFilename,
        },
      },
    });

    if (!raw) return null;

    return {
      id: raw.id,
      tenantId: raw.tenantId,
      projectId: raw.projectId,
      environment: raw.environment,
      serviceName: raw.serviceName,
      date: raw.date,
      segmentFilename: raw.segmentFilename,
      recordCount: raw.recordCount,
      byteSize: raw.byteSize,
      sha256Checksum: raw.sha256Checksum,
      firstEventTimestamp: raw.firstEventTimestamp,
      lastEventTimestamp: raw.lastEventTimestamp,
      finalizedAt: raw.finalizedAt,
      writerInstanceId: raw.writerInstanceId,
      journalSegmentId: raw.journalSegmentId,
      journalStartOffset: raw.journalStartOffset,
      journalEndOffset: raw.journalEndOffset,
    };
  }

  public async saveSegment(segment: ArchiveSegmentRecord): Promise<void> {
    await this.prisma.archiveSegment.upsert({
      where: {
        tenantId_projectId_environment_serviceName_date_segmentFilename: {
          tenantId: segment.tenantId,
          projectId: segment.projectId,
          environment: segment.environment,
          serviceName: segment.serviceName,
          date: segment.date,
          segmentFilename: segment.segmentFilename,
        },
      },
      update: {
        recordCount: segment.recordCount,
        byteSize: BigInt(segment.byteSize),
        sha256Checksum: segment.sha256Checksum,
        lastEventTimestamp: segment.lastEventTimestamp,
        finalizedAt: segment.finalizedAt,
      },
      create: {
        id: segment.id,
        tenantId: segment.tenantId,
        projectId: segment.projectId,
        environment: segment.environment,
        serviceName: segment.serviceName,
        date: segment.date,
        segmentFilename: segment.segmentFilename,
        recordCount: segment.recordCount,
        byteSize: BigInt(segment.byteSize),
        sha256Checksum: segment.sha256Checksum,
        firstEventTimestamp: segment.firstEventTimestamp,
        lastEventTimestamp: segment.lastEventTimestamp,
        finalizedAt: segment.finalizedAt,
        writerInstanceId: segment.writerInstanceId,
        journalSegmentId: segment.journalSegmentId,
        journalStartOffset: BigInt(segment.journalStartOffset),
        journalEndOffset: BigInt(segment.journalEndOffset),
      },
    });
  }
}
