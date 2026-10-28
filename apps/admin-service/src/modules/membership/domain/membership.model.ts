import type { SystemRole } from '../../authorization/domain/role.model.js';

export type MembershipStatus = 'PENDING_INVITE' | 'ACTIVE' | 'SUSPENDED' | 'REVOKED';

export interface TenantMembershipRecord {
  id: string;
  tenantId: string;
  userId: string;
  status: MembershipStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectMembershipRecord {
  id: string;
  tenantId: string;
  projectId: string;
  userId: string;
  status: MembershipStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface RoleAssignmentRecord {
  id: string;
  tenantId: string;
  userId: string;
  role: SystemRole;
  projectId?: string | null;
  createdAt: Date;
}

export interface ResolvedUserMemberships {
  tenantId: string;
  userId: string;
  status: MembershipStatus;
  tenantRoles: SystemRole[];
  projectGrants: Array<{
    projectId: string;
    roles: SystemRole[];
    status: MembershipStatus;
  }>;
}
