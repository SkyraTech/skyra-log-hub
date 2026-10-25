import { Injectable } from '@nestjs/common';
import type { ProjectEntity } from '../entities/metadata.entities.js';
import type { IProjectRepository } from './project.repository.interface.js';

@Injectable()
export class InMemoryProjectRepository implements IProjectRepository {
  private readonly projects = new Map<string, ProjectEntity>();

  public async findById(id: string): Promise<ProjectEntity | null> {
    const project = this.projects.get(id);
    return project ? { ...project } : null;
  }

  public async save(project: ProjectEntity): Promise<void> {
    this.projects.set(project.id, { ...project });
  }

  public clear(): void {
    this.projects.clear();
  }
}
