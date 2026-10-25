export interface ArchiveSegmentRecord {
  id: string;
  tenantId: string;
  projectId: string;
  environment: string;
  serviceName: string;
  date: string; // YYYY-MM-DD
  segmentFilename: string; // segment-0000.jsonl
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

export const ARCHIVE_SEGMENT_REPOSITORY = Symbol('ARCHIVE_SEGMENT_REPOSITORY');

export interface IArchiveSegmentRepository {
  findSegment(
    tenantId: string,
    projectId: string,
    environment: string,
    serviceName: string,
    date: string,
    segmentFilename: string,
  ): Promise<ArchiveSegmentRecord | null>;
  saveSegment(segment: ArchiveSegmentRecord): Promise<void>;
  listSegmentsForPartition(
    tenantId: string,
    projectId: string,
    environment: string,
    serviceName: string,
    date: string,
  ): Promise<ArchiveSegmentRecord[]>;
}
