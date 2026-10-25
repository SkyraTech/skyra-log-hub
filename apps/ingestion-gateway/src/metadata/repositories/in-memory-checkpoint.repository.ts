import { Injectable } from '@nestjs/common';
import type { ICheckpointRepository, IngestionCheckpointRecord } from './checkpoint.repository.interface.js';

@Injectable()
export class InMemoryCheckpointRepository implements ICheckpointRepository {
  private readonly checkpoints = new Map<string, IngestionCheckpointRecord>();

  public async getCheckpoint(id: string): Promise<IngestionCheckpointRecord | null> {
    const item = this.checkpoints.get(id);
    return item ? { ...item } : null;
  }

  public async saveCheckpoint(checkpoint: IngestionCheckpointRecord): Promise<void> {
    this.checkpoints.set(checkpoint.id, { ...checkpoint });
  }
}
