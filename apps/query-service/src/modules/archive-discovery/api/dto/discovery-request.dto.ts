export interface DiscoveryTimeRangeDto {
  start?: string; // ISO 8601 UTC
  end?: string;   // ISO 8601 UTC
}

export interface DiscoverArchiveSegmentsRequestDto {
  time_range?: DiscoveryTimeRangeDto;
  projects?: string[];
  environments?: string[];
  services?: string[];
  start_date?: string; // YYYY-MM-DD
  end_date?: string;   // YYYY-MM-DD
  limit?: number;
}
