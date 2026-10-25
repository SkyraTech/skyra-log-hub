import { Injectable } from '@nestjs/common';
import type { TenantEntity } from '../entities/metadata.entities.js';
import type { ITenantRepository } from './tenant.repository.interface.js';

@Injectable()
export class InMemoryTenantRepository implements ITenantRepository {
  private readonly tenants = new Map<string, TenantEntity>();

  public async findById(id: string): Promise<TenantEntity | null> {
    const tenant = this.tenants.get(id);
    return tenant ? { ...tenant } : null;
  }

  public async save(tenant: TenantEntity): Promise<void> {
    this.tenants.set(tenant.id, { ...tenant });
  }

  public clear(): void {
    this.tenants.clear();
  }
}
