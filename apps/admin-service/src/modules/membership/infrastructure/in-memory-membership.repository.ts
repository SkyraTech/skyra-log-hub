import { Injectable } from '@nestjs/common';
import type { IMembershipRepositoryPort } from '../domain/membership.repository.port.js';
import type {
  TenantMembershipRecord,
  ProjectMembershipRecord,
  RoleAssignmentRecord,
} from '../domain/membership.model.js';

@Injectable()
export class InMemoryMembershipRepository implements IMembershipRepositoryPort {
  private readonly tenantMemberships = new Map<string, TenantMembershipRecord>();
  private readonly projectMemberships = new Map<string, ProjectMembershipRecord>();
  private readonly roleAssignments = new Map<string, RoleAssignmentRecord>();

  public async findTenantMembership(tenantId: string, userId: string): Promise<TenantMembershipRecord | null> {
    const key = `${tenantId}::${userId}`;
    return this.tenantMemberships.get(key) ?? null;
  }

  public async listUserTenantMemberships(userId: string): Promise<TenantMembershipRecord[]> {
    const result: TenantMembershipRecord[] = [];
    for (const m of this.tenantMemberships.values()) {
      if (m.userId === userId) {
        result.push(m);
      }
    }
    return result;
  }

  public async findProjectMembership(
    tenantId: string,
    projectId: string,
    userId: string,
  ): Promise<ProjectMembershipRecord | null> {
    const key = `${tenantId}::${projectId}::${userId}`;
    return this.projectMemberships.get(key) ?? null;
  }

  public async listUserProjectMemberships(tenantId: string, userId: string): Promise<ProjectMembershipRecord[]> {
    const result: ProjectMembershipRecord[] = [];
    for (const m of this.projectMemberships.values()) {
      if (m.tenantId === tenantId && m.userId === userId) {
        result.push(m);
      }
    }
    return result;
  }

  public async listRoleAssignments(tenantId: string, userId: string): Promise<RoleAssignmentRecord[]> {
    const result: RoleAssignmentRecord[] = [];
    for (const ra of this.roleAssignments.values()) {
      if (ra.tenantId === tenantId && ra.userId === userId) {
        result.push(ra);
      }
    }
    return result;
  }

  public async countTenantOwners(tenantId: string): Promise<number> {
    const ownerUsers = new Set<string>();
    for (const ra of this.roleAssignments.values()) {
      if (ra.tenantId === tenantId && ra.role === 'OrgOwner') {
        const tm = await this.findTenantMembership(tenantId, ra.userId);
        if (tm && tm.status === 'ACTIVE') {
          ownerUsers.add(ra.userId);
        }
      }
    }
    return ownerUsers.size;
  }

  public async saveTenantMembership(m: TenantMembershipRecord): Promise<TenantMembershipRecord> {
    const key = `${m.tenantId}::${m.userId}`;
    this.tenantMemberships.set(key, m);
    return m;
  }

  public async saveProjectMembership(m: ProjectMembershipRecord): Promise<ProjectMembershipRecord> {
    const key = `${m.tenantId}::${m.projectId}::${m.userId}`;
    this.projectMemberships.set(key, m);
    return m;
  }

  public async saveRoleAssignment(ra: RoleAssignmentRecord): Promise<RoleAssignmentRecord> {
    this.roleAssignments.set(ra.id, ra);
    return ra;
  }

  public async deleteRoleAssignment(id: string): Promise<void> {
    this.roleAssignments.delete(id);
  }

  public async revokeTenantMembership(tenantId: string, userId: string): Promise<void> {
    const key = `${tenantId}::${userId}`;
    const tm = this.tenantMemberships.get(key);
    if (tm) {
      tm.status = 'REVOKED';
      tm.updatedAt = new Date();
    }

    // Revoke all child project memberships
    for (const pm of this.projectMemberships.values()) {
      if (pm.tenantId === tenantId && pm.userId === userId) {
        pm.status = 'REVOKED';
        pm.updatedAt = new Date();
      }
    }
  }

  public clear(): void {
    this.tenantMemberships.clear();
    this.projectMemberships.clear();
    this.roleAssignments.clear();
  }
}
