import { Injectable } from '@nestjs/common';
import type { IReceiptRepository, DeduplicationReceiptRecord } from './receipt.repository.interface.js';

@Injectable()
export class InMemoryReceiptRepository implements IReceiptRepository {
  private readonly receipts = new Map<string, DeduplicationReceiptRecord>();

  private buildKey(tenantId: string, projectId: string, batchId: string): string {
    return `${tenantId}#${projectId}#${batchId}`;
  }

  public async findReceipt(tenantId: string, projectId: string, batchId: string): Promise<DeduplicationReceiptRecord | null> {
    const key = this.buildKey(tenantId, projectId, batchId);
    const item = this.receipts.get(key);
    if (!item) return null;
    return { ...item };
  }

  public async saveReceipt(receipt: DeduplicationReceiptRecord): Promise<void> {
    const key = this.buildKey(receipt.tenantId, receipt.projectId, receipt.batchId);
    this.receipts.set(key, { ...receipt });
  }

  public async reconcileReceipts(records: DeduplicationReceiptRecord[]): Promise<number> {
    let inserted = 0;
    for (const r of records) {
      const key = this.buildKey(r.tenantId, r.projectId, r.batchId);
      if (!this.receipts.has(key)) {
        this.receipts.set(key, { ...r });
        inserted++;
      }
    }
    return inserted;
  }

  public async pruneExpiredReceipts(before: Date): Promise<number> {
    let pruned = 0;
    for (const [key, item] of this.receipts.entries()) {
      if (item.expiresAt < before) {
        this.receipts.delete(key);
        pruned++;
      }
    }
    return pruned;
  }

  public clear(): void {
    this.receipts.clear();
  }
}
