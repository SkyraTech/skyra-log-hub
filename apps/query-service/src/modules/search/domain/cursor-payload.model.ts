export interface InternalCursorPayload {
  readonly cursor_version: '1.0';
  readonly timestamp: string;
  readonly event_id: string;
  readonly segment_id: string;
  readonly record_offset: number;
  readonly sort_direction: 'asc' | 'desc';
  readonly query_fingerprint: string;
  readonly tenant_id: string;
  readonly created_at: number;
  readonly signature: string;
}
