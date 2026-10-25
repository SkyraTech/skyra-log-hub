import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service.js';
import type { IReceiptRepository, DeduplicationReceiptRecord } from './receipt.repository.interface.js';

@Injectable()
export class PrismaReceiptRepository implements IReceiptRepository {
  private readonly logger = new Logger(PrismaReceiptRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  public async findReceipt(tenantId: string, projectId: string, batchId: string): Promise<DeduplicationReceiptRecord | null> {
    const raw = await this.prisma.deduplicationReceipt.findUnique({
      where: {
        tenantId_projectId_batchId: {
          tenantId,
          projectId,
          batchId,
        },
      },
    });

    if (!raw) return null;

    return {
      id: raw.id,
      tenantId: raw.tenantId,
      projectId: raw.projectId,
      batchId: raw.batchId,
      contentDigest: raw.contentDigest,
      journalSegment: raw.journalSegment,
      journalOffset: raw.journalOffset,
      acceptedCount: raw.acceptedCount,
      committedAt: raw.committedAt,
      expiresAt: raw.expiresAt,
    };
  }

  public async saveReceipt(receipt: DeduplicationReceiptRecord): Promise<void> {
    await this.prisma.deduplicationReceipt.create({
      data: {
        id: receipt.id,
        tenantId: receipt.tenantId,
        projectId: receipt.projectId,
        batchId: receipt.batchId,
        contentDigest: receipt.contentDigest,
        journalSegment: receipt.journalSegment,
        journalOffset: BigInt(receipt.journalOffset),
        acceptedCount: receipt.acceptedCount,
        committedAt: receipt.committedAt,
        expiresAt: receipt.expiresAt,
      },
    });
  }

  public async reconcileReceipts(records: DeduplicationReceiptRecord[]): Promise<number> {
    let inserted = 0;
    for (const r of records) {
      try {
        await this.prisma.deduplicationReceipt.upsert({
          where: {
            tenantId_projectId_batchId: {
              tenantId: r.tenantId,
              projectId: r.projectId,
              batchId: r.batchId,
            },
          },
          update: {},
          create: {
            id: r.id,
            tenantId: r.tenantId,
            projectId: r.projectId,
            batchId: r.batchId,
            contentDigest: r.contentDigest,
            journalSegment: r.journalSegment,
            journalOffset: BigInt(r.journalOffset),
            acceptedCount: r.acceptedCount,
            committedAt: r.committedAt,
            expiresAt: r.expiresAt,
          },
        });
        inserted++;
      } catch (err) {
        this.logger.warn(`Failed to reconcile receipt for batch ${r.batchId}: ${String(err)}`);
      }
    }
    return inserted;
  }

  public async pruneExpiredReceipts(before: Date): Promise<number> {
    const result = await this.prisma.deduplicationReceipt.deleteMany({
      where: {
        expiresAt: {
          lt: before,
        },
      },
    });
    return result.count;
  }
}
