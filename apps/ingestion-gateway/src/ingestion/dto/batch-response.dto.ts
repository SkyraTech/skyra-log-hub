export interface BatchReceiptDto {
  receipt_id: string;
  journal_segment: string;
  journal_offset: number;
  committed_at: string;
  content_digest: string;
}

export interface IngestionBatchResponseDto {
  status: 'durably_accepted';
  batch_id: string;
  accepted_count: number;
  duplicate: boolean;
  receipt: BatchReceiptDto;
}
