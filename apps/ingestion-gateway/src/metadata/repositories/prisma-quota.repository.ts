import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service.js';
import type { ProjectQuotaEntity } from '../entities/metadata.entities.js';
import type { IQuotaRepository } from './quota.repository.interface.js';

@Injectable()
export class PrismaQuotaRepository implements IQuotaRepository {
  constructor(private readonly prisma: PrismaService) {}

  public async findByProjectId(projectId: string): Promise<ProjectQuotaEntity | null> {
    const quota = await this.prisma.projectQuota.findFirst({
      where: { projectId },
    });
    if (!quota) return null;
    return {
      id: quota.id,
      tenantId: quota.tenantId,
      projectId: quota.projectId,
      maxBatchSize: quota.maxBatchSize,
      maxPayloadBytes: quota.maxPayloadBytes,
      maxEventsPerSec: quota.maxEventsPerSec,
      createdAt: quota.createdAt,
      updatedAt: quota.updatedAt,
    };
  }

  public async save(quota: ProjectQuotaEntity): Promise<void> {
    await this.prisma.projectQuota.upsert({
      where: {
        tenantId_projectId: {
          tenantId: quota.tenantId,
          projectId: quota.projectId,
        },
      },
      create: {
        id: quota.id,
        tenantId: quota.tenantId,
        projectId: quota.projectId,
        maxBatchSize: quota.maxBatchSize,
        maxPayloadBytes: quota.maxPayloadBytes,
        maxEventsPerSec: quota.maxEventsPerSec,
      },
      update: {
        maxBatchSize: quota.maxBatchSize,
        maxPayloadBytes: quota.maxPayloadBytes,
        maxEventsPerSec: quota.maxEventsPerSec,
      },
    });
  }
}
