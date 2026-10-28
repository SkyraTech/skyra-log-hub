import { Injectable, Logger } from '@nestjs/common';
import type { SystemRole } from '../domain/role.model.js';
import type { AdminCapability } from '../domain/permission.model.js';
import { RBAC_ROLE_CAPABILITIES, roleHasCapability } from '../domain/rbac-matrix.js';
import {
  InsufficientPermissionException,
  SelfEscalationException,
  CrossTenantViolationException,
  LastOwnerProtectionException,
} from '../../../core/errors/admin.errors.js';

export interface UserRoleAssignment {
  tenantId: string;
  userId: string;
  role: SystemRole;
  projectId?: string | null;
}

@Injectable()
export class EffectivePermissionResolver {
  private readonly logger = new Logger(EffectivePermissionResolver.name);

  /**
   * Resolves the deduplicated set of effective capabilities for a user in a tenant and optional project.
   * If a role is tenant-wide (projectId is null or undefined), its capabilities apply across all projects.
   * If a role is project-scoped, its capabilities apply strictly when evaluating that project.
   */
  public resolveEffectiveCapabilities(
    assignments: UserRoleAssignment[],
    tenantId: string,
    projectId?: string,
  ): Set<AdminCapability> {
    const effective = new Set<AdminCapability>();

    for (const assignment of assignments) {
      if (assignment.tenantId !== tenantId) {
        continue;
      }

      const isTenantWide = !assignment.projectId;
      const isMatchingProject = projectId && assignment.projectId === projectId;

      if (isTenantWide || isMatchingProject) {
        const caps = RBAC_ROLE_CAPABILITIES[assignment.role] ?? [];
        for (const cap of caps) {
          effective.add(cap);
        }
      }
    }

    return effective;
  }

  /**
   * Asserts that the effective capabilities include the required capability, or throws InsufficientPermissionException.
   */
  public assertHasCapability(
    capabilities: Set<AdminCapability>,
    required: AdminCapability,
    actionDescription = 'perform this administrative action',
  ): void {
    if (!capabilities.has(required)) {
      this.logger.warn(`Permission denied: missing required capability "${required}" for action "${actionDescription}".`);
      throw new InsufficientPermissionException(
        `Access denied. You lack the required capability "${required}" to ${actionDescription}.`,
      );
    }
  }

  /**
   * Validates role assignment to prevent self-escalation and cross-tenant grants.
   * 1. Actor must belong to the target tenant.
   * 2. Actor must possess every capability granted by the target role.
   */
  public validateRoleAssignmentGrant(
    actorTenantId: string,
    actorCapabilities: Set<AdminCapability>,
    targetTenantId: string,
    roleToAssign: SystemRole,
  ): void {
    if (actorTenantId !== targetTenantId) {
      throw new CrossTenantViolationException(
        `Cross-tenant role assignment rejected: actor tenant "${actorTenantId}" cannot grant roles in tenant "${targetTenantId}".`,
      );
    }

    // Self-escalation check: actor must have tenant.members.manage
    if (!actorCapabilities.has('tenant.members.manage') && !actorCapabilities.has('projects.members.manage')) {
      throw new InsufficientPermissionException(
        'You lack membership management privileges to assign roles.',
      );
    }

    // Role capability hierarchy check: actor must possess all capabilities of the role being assigned
    const roleCaps = RBAC_ROLE_CAPABILITIES[roleToAssign] ?? [];
    for (const cap of roleCaps) {
      if (!actorCapabilities.has(cap)) {
        this.logger.warn(`Self-escalation attempt blocked: actor lacks capability "${cap}" present in target role "${roleToAssign}".`);
        throw new SelfEscalationException(
          `Self-escalation forbidden: you cannot grant role "${roleToAssign}" because you do not possess capability "${cap}".`,
        );
      }
    }
  }

  /**
   * Asserts that removing or modifying an OrgOwner role assignment does not orphan the tenant.
   */
  public assertNotLastOwner(
    activeTenantOwnerCount: number,
    roleBeingRemovedOrDowngraded: SystemRole,
  ): void {
    if (roleBeingRemovedOrDowngraded === 'OrgOwner' && activeTenantOwnerCount <= 1) {
      throw new LastOwnerProtectionException(
        'Cannot remove or downgrade the last OrgOwner of a tenant organization. Transfer ownership or assign another OrgOwner first.',
      );
    }
  }
}
