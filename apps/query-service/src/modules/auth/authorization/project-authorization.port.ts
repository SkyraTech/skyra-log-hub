import type { QueryPrincipal } from '../domain/principal.model.js';

export const PROJECT_AUTHORIZATION_PORT = Symbol('PROJECT_AUTHORIZATION_PORT');

export interface AuthorizedProjectScope {
  readonly tenantId: string;
  readonly effectiveProjects: readonly string[];
  readonly isWildcard: boolean;
}

export interface IProjectAuthorizationPort {
  /**
   * Resolves effective authorized projects by computing the strict intersection:
   * Effective = Requested ∩ Authorized
   * Throws ForbiddenProjectException if any requested project is unauthorized.
   * Throws CrossTenantViolationException if cross-tenant access is attempted.
   */
  resolveAuthorizedProjects(
    principal: QueryPrincipal,
    requestedProjectIds?: readonly string[],
    requestedTenantId?: string,
  ): Promise<AuthorizedProjectScope>;
}
