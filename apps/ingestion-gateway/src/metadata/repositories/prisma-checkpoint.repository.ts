import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service.js';
import type { ICheckpointRepository, IngestionCheckpointRecord } from './checkpoint.repository.interface.js';

@Injectable()
export class PrismaCheckpointRepository implements ICheckpointRepository {
  constructor(private readonly prisma: PrismaService) {}

  public async getCheckpoint(id: string): Promise<IngestionCheckpointRecord | null> {
    const raw = await this.prisma.ingestionCheckpoint.findUnique({
      where: { id },
    });

    if (!raw) return null;

    return {
      id: raw.id,
      journalSegment: raw.journalSegment,
      byteOffset: raw.byteOffset,
      updatedAt: raw.updatedAt,
    };
  }

  public async saveCheckpoint(checkpoint: IngestionCheckpointRecord): Promise<void> {
    await this.prisma.ingestionCheckpoint.upsert({
      where: { id: checkpoint.id },
      update: {
        journalSegment: checkpoint.journalSegment,
        byteOffset: BigInt(checkpoint.byteOffset),
        updatedAt: checkpoint.updatedAt,
      },
      create: {
        id: checkpoint.id,
        journalSegment: checkpoint.journalSegment,
        byteOffset: BigInt(checkpoint.byteOffset),
        updatedAt: checkpoint.updatedAt,
      },
    });
  }
}
