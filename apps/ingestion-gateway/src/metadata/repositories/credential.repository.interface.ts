import type { IngestionCredentialEntity } from '../entities/metadata.entities.js';

export const CREDENTIAL_REPOSITORY = Symbol('CREDENTIAL_REPOSITORY');

export interface ICredentialRepository {
  findByKeyHash(keyHash: string): Promise<IngestionCredentialEntity | null>;
  updateLastUsed(id: string, timestamp: Date): Promise<void>;
  save(credential: IngestionCredentialEntity): Promise<void>;
}
