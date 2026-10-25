import type { TenantEntity } from '../entities/metadata.entities.js';

export const TENANT_REPOSITORY = Symbol('TENANT_REPOSITORY');

export interface ITenantRepository {
  findById(id: string): Promise<TenantEntity | null>;
  save(tenant: TenantEntity): Promise<void>;
}
