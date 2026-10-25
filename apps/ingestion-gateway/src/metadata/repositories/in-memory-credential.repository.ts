import { Injectable } from '@nestjs/common';
import type { IngestionCredentialEntity } from '../entities/metadata.entities.js';
import type { ICredentialRepository } from './credential.repository.interface.js';

@Injectable()
export class InMemoryCredentialRepository implements ICredentialRepository {
  private readonly credentials = new Map<string, IngestionCredentialEntity>();

  public async findByKeyHash(keyHash: string): Promise<IngestionCredentialEntity | null> {
    for (const cred of this.credentials.values()) {
      if (cred.keyHash === keyHash) {
        return { ...cred };
      }
    }
    return null;
  }

  public async updateLastUsed(id: string, timestamp: Date): Promise<void> {
    const cred = this.credentials.get(id);
    if (cred) {
      cred.lastUsedAt = timestamp;
    }
  }

  public async save(credential: IngestionCredentialEntity): Promise<void> {
    this.credentials.set(credential.id, { ...credential });
  }

  public clear(): void {
    this.credentials.clear();
  }
}
