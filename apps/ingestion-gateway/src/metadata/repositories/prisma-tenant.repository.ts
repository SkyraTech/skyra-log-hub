import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service.js';
import type { TenantEntity } from '../entities/metadata.entities.js';
import type { ITenantRepository } from './tenant.repository.interface.js';

@Injectable()
export class PrismaTenantRepository implements ITenantRepository {
  constructor(private readonly prisma: PrismaService) {}

  public async findById(id: string): Promise<TenantEntity | null> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
    });
    if (!tenant) return null;
    return {
      id: tenant.id,
      code: tenant.code,
      name: tenant.name,
      status: tenant.status as 'ACTIVE' | 'SUSPENDED' | 'DECOMMISSIONED',
      createdAt: tenant.createdAt,
      updatedAt: tenant.updatedAt,
    };
  }

  public async save(tenant: TenantEntity): Promise<void> {
    await this.prisma.tenant.upsert({
      where: { id: tenant.id },
      create: {
        id: tenant.id,
        code: tenant.code,
        name: tenant.name,
        status: tenant.status,
      },
      update: {
        code: tenant.code,
        name: tenant.name,
        status: tenant.status,
      },
    });
  }
}
