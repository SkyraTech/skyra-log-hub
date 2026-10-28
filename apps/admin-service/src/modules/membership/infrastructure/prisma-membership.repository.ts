import { Injectable, Logger } from '@nestjs/common';
import type { IMembershipRepositoryPort } from '../domain/membership.repository.port.js';
import type {
  TenantMembershipRecord,
  ProjectMembershipRecord,
  RoleAssignmentRecord,
} from '../domain/membership.model.js';
import { AdminConfigService } from '../../../core/config/admin-config.service.js';
import { MembershipProviderUnavailableException } from '../../../core/errors/admin.errors.js';

@Injectable()
export class PrismaMembershipRepository implements IMembershipRepositoryPort {
  private readonly logger = new Logger(PrismaMembershipRepository.name);

  constructor(private readonly config: AdminConfigService) {}

  public async findTenantMembership(_tenantId: string, _userId: string): Promise<TenantMembershipRecord | null> {
    if (!this.config.persistenceEnabled) {
      throw new MembershipProviderUnavailableException('Prisma membership repository inactive under Gate A.');
    }
    throw new Error('Prisma membership operations pending Gate B database migration execution.');
  }

  public async listUserTenantMemberships(_userId: string): Promise<TenantMembershipRecord[]> {
    if (!this.config.persistenceEnabled) {
      throw new MembershipProviderUnavailableException('Prisma membership repository inactive under Gate A.');
    }
    throw new Error('Prisma membership operations pending Gate B database migration execution.');
  }

  public async findProjectMembership(_tenantId: string, _projectId: string, _userId: string): Promise<ProjectMembershipRecord | null> {
    if (!this.config.persistenceEnabled) {
      throw new MembershipProviderUnavailableException('Prisma membership repository inactive under Gate A.');
    }
    throw new Error('Prisma membership operations pending Gate B database migration execution.');
  }

  public async listUserProjectMemberships(_tenantId: string, _userId: string): Promise<ProjectMembershipRecord[]> {
    if (!this.config.persistenceEnabled) {
      throw new MembershipProviderUnavailableException('Prisma membership repository inactive under Gate A.');
    }
    throw new Error('Prisma membership operations pending Gate B database migration execution.');
  }

  public async listRoleAssignments(_tenantId: string, _userId: string): Promise<RoleAssignmentRecord[]> {
    if (!this.config.persistenceEnabled) {
      throw new MembershipProviderUnavailableException('Prisma membership repository inactive under Gate A.');
    }
    throw new Error('Prisma membership operations pending Gate B database migration execution.');
  }

  public async countTenantOwners(_tenantId: string): Promise<number> {
    if (!this.config.persistenceEnabled) {
      return 0;
    }
    throw new Error('Prisma membership operations pending Gate B database migration execution.');
  }

  public async saveTenantMembership(_m: TenantMembershipRecord): Promise<TenantMembershipRecord> {
    if (!this.config.persistenceEnabled) {
      throw new MembershipProviderUnavailableException('Prisma membership repository inactive under Gate A.');
    }
    throw new Error('Prisma membership operations pending Gate B database migration execution.');
  }

  public async saveProjectMembership(_m: ProjectMembershipRecord): Promise<ProjectMembershipRecord> {
    if (!this.config.persistenceEnabled) {
      throw new MembershipProviderUnavailableException('Prisma membership repository inactive under Gate A.');
    }
    throw new Error('Prisma membership operations pending Gate B database migration execution.');
  }

  public async saveRoleAssignment(_ra: RoleAssignmentRecord): Promise<RoleAssignmentRecord> {
    if (!this.config.persistenceEnabled) {
      throw new MembershipProviderUnavailableException('Prisma membership repository inactive under Gate A.');
    }
    throw new Error('Prisma membership operations pending Gate B database migration execution.');
  }

  public async deleteRoleAssignment(_id: string): Promise<void> {
    if (!this.config.persistenceEnabled) {
      throw new MembershipProviderUnavailableException('Prisma membership repository inactive under Gate A.');
    }
    throw new Error('Prisma membership operations pending Gate B database migration execution.');
  }

  public async revokeTenantMembership(_tenantId: string, _userId: string): Promise<void> {
    if (!this.config.persistenceEnabled) {
      throw new MembershipProviderUnavailableException('Prisma membership repository inactive under Gate A.');
    }
    throw new Error('Prisma membership operations pending Gate B database migration execution.');
  }
}
