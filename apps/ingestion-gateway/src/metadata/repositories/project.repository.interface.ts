import type { ProjectEntity } from '../entities/metadata.entities.js';

export const PROJECT_REPOSITORY = Symbol('PROJECT_REPOSITORY');

export interface IProjectRepository {
  findById(id: string): Promise<ProjectEntity | null>;
  save(project: ProjectEntity): Promise<void>;
}
