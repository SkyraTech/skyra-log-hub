import { Injectable, Logger } from '@nestjs/common';
import type { IProjectAuthorizationPort, AuthorizedProjectScope } from './project-authorization.port.js';
import type { QueryPrincipal } from '../domain/principal.model.js';
import {
  ForbiddenProjectException,
  CrossTenantViolationException,
} from '../../../common/errors/query.errors.js';

@Injectable()
export class ProjectAuthorizationService implements IProjectAuthorizationPort {
  private readonly logger = new Logger(ProjectAuthorizationService.name);

  public async resolveAuthorizedProjects(
    principal: QueryPrincipal,
    requestedProjectIds?: readonly string[],
    requestedTenantId?: string,
  ): Promise<AuthorizedProjectScope> {
    // 1. Cross-tenant defense
    if (requestedTenantId && requestedTenantId !== principal.tenantId) {
      this.logger.warn(
        `Cross-tenant access attempt by principal "${principal.sub}": requested "${requestedTenantId}", authorized "${principal.tenantId}"`,
      );
      throw new CrossTenantViolationException(
        `Access to tenant "${requestedTenantId}" is denied for principal in tenant "${principal.tenantId}".`,
      );
    }

    const tenantId = principal.tenantId;
    const allowed = principal.authorizedProjects;

    // 2. Principal with no grants fails closed
    if (!allowed || allowed.length === 0) {
      throw new ForbiddenProjectException('Principal has no authorized project memberships in this tenant.');
    }

    const isWildcard = allowed.includes('*');

    // 3. If no specific projects were requested
    if (!requestedProjectIds || requestedProjectIds.length === 0) {
      return {
        tenantId,
        effectiveProjects: allowed,
        isWildcard,
      };
    }

    // 4. Validate requested projects against authorization grants
    if (isWildcard) {
      return {
        tenantId,
        effectiveProjects: [...requestedProjectIds],
        isWildcard: false,
      };
    }

    const allowedSet = new Set(allowed);
    const unauthorized = requestedProjectIds.filter((p) => !allowedSet.has(p));

    if (unauthorized.length > 0) {
      this.logger.warn(
        `Unauthorized project access rejected for principal "${principal.sub}": projects [${unauthorized.join(', ')}]`,
      );
      throw new ForbiddenProjectException(
        `Access denied to projects [${unauthorized.join(', ')}]. Authorized projects are [${allowed.join(', ')}].`,
      );
    }

    return {
      tenantId,
      effectiveProjects: [...requestedProjectIds],
      isWildcard: false,
    };
  }
}
