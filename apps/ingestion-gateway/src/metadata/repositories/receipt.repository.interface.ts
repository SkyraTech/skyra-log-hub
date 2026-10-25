export interface DeduplicationReceiptRecord {
  id: string;
  tenantId: string;
  projectId: string;
  batchId: string;
  contentDigest: string;
  journalSegment: string;
  journalOffset: bigint | number;
  acceptedCount: number;
  committedAt: Date;
  expiresAt: Date;
}

export const RECEIPT_REPOSITORY = Symbol('RECEIPT_REPOSITORY');

export interface IReceiptRepository {
  findReceipt(tenantId: string, projectId: string, batchId: string): Promise<DeduplicationReceiptRecord | null>;
  saveReceipt(receipt: DeduplicationReceiptRecord): Promise<void>;
  reconcileReceipts(receipts: DeduplicationReceiptRecord[]): Promise<number>;
  pruneExpiredReceipts(before: Date): Promise<number>;
}
