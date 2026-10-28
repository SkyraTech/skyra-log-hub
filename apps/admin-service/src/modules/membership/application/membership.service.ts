import * as crypto from 'node:crypto';
import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  MEMBERSHIP_REPOSITORY_PORT,
  type IMembershipRepositoryPort,
} from '../domain/membership.repository.port.js';
import {
  AUDIT_PERSISTENCE_PORT,
  type IAuditPersistencePort,
} from '../../../core/audit/domain/audit-persistence.port.js';
import type {
  TenantMembershipRecord,
  ProjectMembershipRecord,
  RoleAssignmentRecord,
  ResolvedUserMemberships,
} from '../domain/membership.model.js';
import type { SystemRole } from '../../authorization/domain/role.model.js';
import { EffectivePermissionResolver } from '../../authorization/application/effective-permission.resolver.js';
import {
  TenantMembershipNotFoundException,
  LastOwnerProtectionException,
} from '../../../core/errors/admin.errors.js';

@Injectable()
export class MembershipService {
  private readonly logger = new Logger(MembershipService.name);

  constructor(
    @Inject(MEMBERSHIP_REPOSITORY_PORT)
    private readonly repo: IMembershipRepositoryPort,
    @Inject(AUDIT_PERSISTENCE_PORT)
    private readonly auditRepo: IAuditPersistencePort,
    private readonly permissionResolver: EffectivePermissionResolver,
  ) {}

  /**
   * Resolves authoritative memberships and effective roles for a user in a tenant.
   * Throws TenantMembershipNotFoundException if user has no active tenant membership.
   */
  public async resolveUserMemberships(tenantId: string, userId: string): Promise<ResolvedUserMemberships> {
    const tm = await this.repo.findTenantMembership(tenantId, userId);
    if (!tm || tm.status !== 'ACTIVE') {
      throw new TenantMembershipNotFoundException(
        `User "${userId}" does not have an active membership in tenant "${tenantId}".`,
      );
    }

    const roleAssignments = await this.repo.listRoleAssignments(tenantId, userId);
    const projectMemberships = await this.repo.listUserProjectMemberships(tenantId, userId);

    const tenantRoles: SystemRole[] = [];
    const projectRolesMap = new Map<string, SystemRole[]>();

    for (const ra of roleAssignments) {
      if (!ra.projectId) {
        tenantRoles.push(ra.role);
      } else {
        const existing = projectRolesMap.get(ra.projectId) ?? [];
        existing.push(ra.role);
        projectRolesMap.set(ra.projectId, existing);
      }
    }

    const projectGrants = projectMemberships.map((pm) => ({
      projectId: pm.projectId,
      roles: projectRolesMap.get(pm.projectId) ?? [],
      status: pm.status,
    }));

    return {
      tenantId,
      userId,
      status: tm.status,
      tenantRoles,
      projectGrants,
    };
  }

  /**
   * Assigns a role to a user.
   */
  public async assignRole(
    actorUserId: string,
    actorEmail: string,
    tenantId: string,
    targetUserId: string,
    role: SystemRole,
    projectId?: string | null,
  ): Promise<RoleAssignmentRecord> {
    // 1. Ensure user has tenant membership
    let tm = await this.repo.findTenantMembership(tenantId, targetUserId);
    if (!tm) {
      const now = new Date();
      tm = await this.repo.saveTenantMembership({
        id: crypto.randomUUID(),
        tenantId,
        userId: targetUserId,
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      });
    }

    // 2. If project-scoped, ensure project membership exists
    if (projectId) {
      let pm = await this.repo.findProjectMembership(tenantId, projectId, targetUserId);
      if (!pm) {
        const now = new Date();
        pm = await this.repo.saveProjectMembership({
          id: crypto.randomUUID(),
          tenantId,
          projectId,
          userId: targetUserId,
          status: 'ACTIVE',
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    // 3. Save role assignment
    const now = new Date();
    const assignment: RoleAssignmentRecord = {
      id: crypto.randomUUID(),
      tenantId,
      userId: targetUserId,
      role,
      projectId: projectId ?? null,
      createdAt: now,
    };
    const saved = await this.repo.saveRoleAssignment(assignment);

    // 4. Audit
    await this.auditRepo.recordAuditEvent({
      tenantId,
      actorUserId,
      actorEmail,
      action: 'MEMBER_ROLE_CHANGED',
      targetType: 'membership',
      targetId: targetUserId,
      details: { role, projectId: projectId ?? null },
      createdAt: now,
    });

    return saved;
  }

  /**
   * Revokes a user's tenant membership and all child project grants.
   * Atomically protects against revoking the last OrgOwner.
   */
  public async revokeMembership(
    actorUserId: string,
    actorEmail: string,
    tenantId: string,
    targetUserId: string,
  ): Promise<void> {
    const tm = await this.repo.findTenantMembership(tenantId, targetUserId);
    if (!tm || tm.status === 'REVOKED') {
      return;
    }

    // Check if user is an OrgOwner
    const assignments = await this.repo.listRoleAssignments(tenantId, targetUserId);
    const isOwner = assignments.some((ra) => ra.role === 'OrgOwner' && !ra.projectId);

    if (isOwner) {
      const activeOwners = await this.repo.countTenantOwners(tenantId);
      this.permissionResolver.assertNotLastOwner(activeOwners, 'OrgOwner');
    }

    // Revoke membership in repository
    await this.repo.revokeTenantMembership(tenantId, targetUserId);

    // Atomic audit record
    await this.auditRepo.recordAuditEvent({
      tenantId,
      actorUserId,
      actorEmail,
      action: 'MEMBER_REMOVED',
      targetType: 'membership',
      targetId: targetUserId,
      details: { previousStatus: tm.status, newStatus: 'REVOKED' },
      createdAt: new Date(),
    });
  }
}
