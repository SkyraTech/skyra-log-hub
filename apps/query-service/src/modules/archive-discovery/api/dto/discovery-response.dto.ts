export interface DiscoveredSegmentSummaryDto {
  id: string;
  project_id: string;
  environment: string;
  service_name: string;
  date: string;
  segment_filename: string;
  record_count: number;
  byte_size: number;
  sha256_checksum: string;
  first_event_timestamp: string;
  last_event_timestamp: string;
  finalized_at: string;
  integrity_status: 'VERIFIED' | 'MISSING' | 'CORRUPT';
}

export interface DiscoverArchiveSegmentsResponseDto {
  meta: {
    tenant_id: string;
    authorized_projects: readonly string[];
    total_discovered: number;
    verified_count: number;
    missing_count: number;
    corrupt_count: number;
    execution_time_ms: number;
  };
  segments: readonly DiscoveredSegmentSummaryDto[];
}
