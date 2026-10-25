import { Injectable } from '@nestjs/common';
import type { IArchiveSegmentRepository, ArchiveSegmentRecord } from './archive-segment.repository.interface.js';

@Injectable()
export class InMemoryArchiveSegmentRepository implements IArchiveSegmentRepository {
  private readonly segments = new Map<string, ArchiveSegmentRecord>();

  private buildKey(
    tenantId: string,
    projectId: string,
    environment: string,
    serviceName: string,
    date: string,
    segmentFilename: string,
  ): string {
    return `${tenantId}#${projectId}#${environment}#${serviceName}#${date}#${segmentFilename}`;
  }

  public async findSegment(
    tenantId: string,
    projectId: string,
    environment: string,
    serviceName: string,
    date: string,
    segmentFilename: string,
  ): Promise<ArchiveSegmentRecord | null> {
    const key = this.buildKey(tenantId, projectId, environment, serviceName, date, segmentFilename);
    const item = this.segments.get(key);
    return item ? { ...item } : null;
  }

  public async saveSegment(segment: ArchiveSegmentRecord): Promise<void> {
    const key = this.buildKey(
      segment.tenantId,
      segment.projectId,
      segment.environment,
      segment.serviceName,
      segment.date,
      segment.segmentFilename,
    );
    this.segments.set(key, { ...segment });
  }

  public async listSegmentsForPartition(
    tenantId: string,
    projectId: string,
    environment: string,
    serviceName: string,
    date: string,
  ): Promise<ArchiveSegmentRecord[]> {
    const prefix = `${tenantId}#${projectId}#${environment}#${serviceName}#${date}#`;
    const results: ArchiveSegmentRecord[] = [];
    for (const [key, item] of this.segments.entries()) {
      if (key.startsWith(prefix)) {
        results.push({ ...item });
      }
    }
    return results;
  }
}
