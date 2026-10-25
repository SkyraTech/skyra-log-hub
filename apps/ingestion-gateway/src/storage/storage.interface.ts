/**
 * Storage Subsystem Domain Types & Interfaces
 * Task: LOGHUB-ING-003
 */

export interface WalFrameHeader {
  magic: number; // 0x534B5952 ('SKYR')
  version: number; // 1
  payloadLength: number;
  batchId: string; // UUIDv4 string
  tenantId: string;
  projectId: string;
  eventCount: number;
  contentDigestSha256: string; // Hex string 'sha256:...'
}

export interface WalFrame extends WalFrameHeader {
  payload: Buffer;
  crc32c: number;
  offset: number;
  frameLength: number;
}

export interface WalCommitReceipt {
  receiptId: string;
  journalSegment: string;
  journalOffset: number;
  committedAt: string; // RFC3339 UTC
  contentDigest: string; // 'sha256:...'
  batchId: string;
  tenantId: string;
  projectId: string;
  acceptedCount: number;
  duplicate: boolean;
}

export interface ArchiveSegmentManifest {
  manifest_version: '1.0';
  tenant_id: string;
  project_id: string;
  environment: 'production' | 'staging' | 'development' | 'test' | 'local';
  service_name: string;
  date: string; // YYYY-MM-DD
  segment_filename: string; // segment-0000.jsonl
  record_count: number;
  byte_size: number;
  sha256_checksum: string;
  first_event_timestamp: string; // RFC3339 UTC
  last_event_timestamp: string; // RFC3339 UTC
  finalized_at: string; // RFC3339 UTC
  writer_instance_id: string;
  journal_commit_range: {
    segment_id: string;
    start_offset: number;
    end_offset: number;
  };
}

export interface StorageReadinessState {
  isReady: boolean;
  walReady: boolean;
  archiveReady: boolean;
  databaseReady: boolean;
  reconciliationComplete: boolean;
  details?: Record<string, unknown>;
}
