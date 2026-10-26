export interface ArchiveSegmentRecord {
  id: string;
  tenantId: string;
  projectId: string;
  environment: string;
  serviceName: string;
  date: string;
  segmentFilename: string;
  recordCount: number;
  byteSize: bigint | number;
  sha256Checksum: string;
  firstEventTimestamp: Date;
  lastEventTimestamp: Date;
  finalizedAt: Date;
  writerInstanceId: string;
  journalSegmentId: string;
  journalStartOffset: bigint | number;
  journalEndOffset: bigint | number;
}

export interface ArchiveSegmentQueryCriteria {
  tenantId: string;
  projectIds: readonly string[];
  environments?: readonly string[];
  serviceNames?: readonly string[];
  startDate?: string;
  endDate?: string;
  startTime?: Date;
  endTime?: Date;
  limit?: number;
}

export const ARCHIVE_SEGMENT_REPOSITORY = Symbol('ARCHIVE_SEGMENT_REPOSITORY');

export interface IArchiveSegmentRepository {
  findSegments(criteria: ArchiveSegmentQueryCriteria): Promise<ArchiveSegmentRecord[]>;
  findSegment(
    tenantId: string,
    projectId: string,
    environment: string,
    serviceName: string,
    date: string,
    segmentFilename: string,
  ): Promise<ArchiveSegmentRecord | null>;
  saveSegment(segment: ArchiveSegmentRecord): Promise<void>;
}
