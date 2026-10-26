export interface SearchPaginationDto {
  readonly has_more: boolean;
  readonly next_cursor: string | null;
  readonly total_returned: number;
}

export interface SearchStatisticsDto {
  readonly scanned_bytes: number;
  readonly scanned_segments: number;
  readonly execution_time_ms: number;
  readonly archive_watermark: string; // ISO 8601 UTC
}

export interface SearchScopeDto {
  readonly tenant_id: string;
  readonly searched_projects: readonly string[];
}

export interface SearchResponseDto {
  readonly events: readonly Record<string, unknown>[];
  readonly pagination: SearchPaginationDto;
  readonly statistics: SearchStatisticsDto;
  readonly scope: SearchScopeDto;
}
