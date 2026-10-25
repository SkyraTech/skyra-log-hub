import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service.js';
import type { ProjectEntity } from '../entities/metadata.entities.js';
import type { IProjectRepository } from './project.repository.interface.js';

@Injectable()
export class PrismaProjectRepository implements IProjectRepository {
  constructor(private readonly prisma: PrismaService) {}

  public async findById(id: string): Promise<ProjectEntity | null> {
    const project = await this.prisma.project.findUnique({
      where: { id },
    });
    if (!project) return null;
    return {
      id: project.id,
      tenantId: project.tenantId,
      name: project.name,
      status: project.status as 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED',
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };
  }

  public async save(project: ProjectEntity): Promise<void> {
    await this.prisma.project.upsert({
      where: { id: project.id },
      create: {
        id: project.id,
        tenantId: project.tenantId,
        name: project.name,
        status: project.status,
      },
      update: {
        name: project.name,
        status: project.status,
      },
    });
  }
}
