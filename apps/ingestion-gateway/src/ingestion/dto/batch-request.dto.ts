export interface IngestionBatchRequestDto {
  protocol_version?: string;
  batch_id?: string;
  sent_at?: string;
  batch_size?: number;
  events?: Record<string, unknown>[];
}

export interface NormalizedBatch {
  protocol_version: '1.0';
  batch_id: string;
  sent_at: string;
  events: Record<string, any>[];
  isLegacyEnvelope: boolean;
  contentDigestSha256: string;
}
