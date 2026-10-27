import type { WorkspaceMembership } from './session.model.js';

export const MEMBERSHIP_PROVIDER_PORT = Symbol('MEMBERSHIP_PROVIDER_PORT');

export interface IMembershipProvider {
  /**
   * Resolves the authoritative workspace and project memberships for an authenticated user.
   * In production, this must query the enterprise directory or IAM service.
   * If not configured in production, it must fail closed.
   */
  resolveMemberships(userId: string, email: string): Promise<WorkspaceMembership[]>;
}
