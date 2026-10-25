import type { ProjectQuotaEntity } from '../entities/metadata.entities.js';

export const QUOTA_REPOSITORY = Symbol('QUOTA_REPOSITORY');

export interface IQuotaRepository {
  findByProjectId(projectId: string): Promise<ProjectQuotaEntity | null>;
  save(quota: ProjectQuotaEntity): Promise<void>;
}
