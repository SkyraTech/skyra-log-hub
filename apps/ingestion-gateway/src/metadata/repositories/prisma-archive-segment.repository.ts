import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service.js';
import type { IArchiveSegmentRepository, ArchiveSegmentRecord } from './archive-segment.repository.interface.js';

@Injectable()
export class PrismaArchiveSegmentRepository implements IArchiveSegmentRepository {
  constructor(private readonly prisma: PrismaService) {}

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
    await this.prisma.archiveSegment.create({
      data: {
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

  public async listSegmentsForPartition(
    tenantId: string,
    projectId: string,
    environment: string,
    serviceName: string,
    date: string,
  ): Promise<ArchiveSegmentRecord[]> {
    const list = await this.prisma.archiveSegment.findMany({
      where: {
        tenantId,
        projectId,
        environment,
        serviceName,
        date,
      },
      orderBy: {
        segmentFilename: 'asc',
      },
    });

    return list.map((raw: any) => ({
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
}
