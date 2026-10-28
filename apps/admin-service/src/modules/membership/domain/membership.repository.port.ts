import type {
  TenantMembershipRecord,
  ProjectMembershipRecord,
  RoleAssignmentRecord,
} from './membership.model.js';

export const MEMBERSHIP_REPOSITORY_PORT = Symbol('MEMBERSHIP_REPOSITORY_PORT');

export interface IMembershipRepositoryPort {
  findTenantMembership(tenantId: string, userId: string): Promise<TenantMembershipRecord | null>;
  listUserTenantMemberships(userId: string): Promise<TenantMembershipRecord[]>;
  findProjectMembership(tenantId: string, projectId: string, userId: string): Promise<ProjectMembershipRecord | null>;
  listUserProjectMemberships(tenantId: string, userId: string): Promise<ProjectMembershipRecord[]>;
  listRoleAssignments(tenantId: string, userId: string): Promise<RoleAssignmentRecord[]>;
  countTenantOwners(tenantId: string): Promise<number>;
  saveTenantMembership(m: TenantMembershipRecord): Promise<TenantMembershipRecord>;
  saveProjectMembership(m: ProjectMembershipRecord): Promise<ProjectMembershipRecord>;
  saveRoleAssignment(ra: RoleAssignmentRecord): Promise<RoleAssignmentRecord>;
  deleteRoleAssignment(id: string): Promise<void>;
  revokeTenantMembership(tenantId: string, userId: string): Promise<void>;
}
