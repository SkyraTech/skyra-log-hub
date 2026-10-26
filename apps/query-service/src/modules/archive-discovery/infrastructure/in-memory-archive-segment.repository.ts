import { Injectable } from '@nestjs/common';
import type {
  IArchiveSegmentRepository,
  ArchiveSegmentRecord,
  ArchiveSegmentQueryCriteria,
} from '../domain/archive-segment.repository.interface.js';

@Injectable()
export class InMemoryArchiveSegmentRepository implements IArchiveSegmentRepository {
  private readonly segments: ArchiveSegmentRecord[] = [];

  public async findSegments(criteria: ArchiveSegmentQueryCriteria): Promise<ArchiveSegmentRecord[]> {
    const projectSet = new Set(criteria.projectIds);
    const envSet = criteria.environments ? new Set(criteria.environments) : null;
    const serviceSet = criteria.serviceNames ? new Set(criteria.serviceNames) : null;

    let filtered = this.segments.filter((s) => {
      if (s.tenantId !== criteria.tenantId) return false;
      if (criteria.projectIds.length > 0 && !criteria.projectIds.includes('*') && !projectSet.has(s.projectId)) {
        return false;
      }
      if (envSet && !envSet.has(s.environment)) return false;
      if (serviceSet && !serviceSet.has(s.serviceName)) return false;
      if (criteria.startDate && s.date < criteria.startDate) return false;
      if (criteria.endDate && s.date > criteria.endDate) return false;
      if (criteria.startTime && s.lastEventTimestamp < criteria.startTime) return false;
      if (criteria.endTime && s.firstEventTimestamp >= criteria.endTime) return false;
      return true;
    });

    // Stable sort: by date asc, segmentFilename asc
    filtered.sort((a, b) => {
      const dateCmp = a.date.localeCompare(b.date);
      if (dateCmp !== 0) return dateCmp;
      return a.segmentFilename.localeCompare(b.segmentFilename);
    });

    if (criteria.limit && criteria.limit > 0) {
      filtered = filtered.slice(0, criteria.limit);
    }

    return filtered;
  }

  public async findSegment(
    tenantId: string,
    projectId: string,
    environment: string,
    serviceName: string,
    date: string,
    segmentFilename: string,
  ): Promise<ArchiveSegmentRecord | null> {
    const found = this.segments.find(
      (s) =>
        s.tenantId === tenantId &&
        s.projectId === projectId &&
        s.environment === environment &&
        s.serviceName === serviceName &&
        s.date === date &&
        s.segmentFilename === segmentFilename,
    );
    return found ? { ...found } : null;
  }

  public async saveSegment(segment: ArchiveSegmentRecord): Promise<void> {
    const existingIdx = this.segments.findIndex(
      (s) =>
        s.tenantId === segment.tenantId &&
        s.projectId === segment.projectId &&
        s.environment === segment.environment &&
        s.serviceName === segment.serviceName &&
        s.date === segment.date &&
        s.segmentFilename === segment.segmentFilename,
    );
    if (existingIdx >= 0) {
      this.segments[existingIdx] = { ...segment };
    } else {
      this.segments.push({ ...segment });
    }
  }

  public clear(): void {
    this.segments.length = 0;
  }
}
