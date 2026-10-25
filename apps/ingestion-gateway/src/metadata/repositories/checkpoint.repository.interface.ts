export interface IngestionCheckpointRecord {
  id: string;
  journalSegment: string;
  byteOffset: bigint | number;
  updatedAt: Date;
}

export const CHECKPOINT_REPOSITORY = Symbol('CHECKPOINT_REPOSITORY');

export interface ICheckpointRepository {
  getCheckpoint(id: string): Promise<IngestionCheckpointRecord | null>;
  saveCheckpoint(checkpoint: IngestionCheckpointRecord): Promise<void>;
}
