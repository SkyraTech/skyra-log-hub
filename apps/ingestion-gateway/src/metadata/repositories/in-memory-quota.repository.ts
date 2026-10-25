import { Injectable } from '@nestjs/common';
import type { ProjectQuotaEntity } from '../entities/metadata.entities.js';
import type { IQuotaRepository } from './quota.repository.interface.js';

@Injectable()
export class InMemoryQuotaRepository implements IQuotaRepository {
  private readonly quotas = new Map<string, ProjectQuotaEntity>();

  public async findByProjectId(projectId: string): Promise<ProjectQuotaEntity | null> {
    const quota = this.quotas.get(projectId);
    return quota ? { ...quota } : null;
  }

  public async save(quota: ProjectQuotaEntity): Promise<void> {
    this.quotas.set(quota.projectId, { ...quota });
  }

  public clear(): void {
    this.quotas.clear();
  }
}
