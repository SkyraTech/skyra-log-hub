import type { SystemRole } from './role.model.js';
import type { AdminCapability } from './permission.model.js';

/**
 * Authoritative RBAC Capability Mapping Matrix (ADR-029).
 * Defines the complete server-enforced permission grants for each role.
 */
export const RBAC_ROLE_CAPABILITIES: Record<SystemRole, readonly AdminCapability[]> = {
  OrgOwner: [
    'tenant.read',
    'tenant.update',
    'tenant.members.read',
    'tenant.members.manage',
    'projects.read',
    'projects.create',
    'projects.update',
    'projects.archive',
    'projects.members.manage',
    'logs.search',
    'logs.analytics',
    'ingestion.credentials.read',
    'ingestion.credentials.create',
    'ingestion.credentials.rotate',
    'ingestion.credentials.revoke',
    'quotas.read',
    'quotas.manage',
    'retention.read',
    'retention.manage',
    'audit.read',
  ],

  OrgAdmin: [
    'tenant.read',
    'tenant.update',
    'tenant.members.read',
    'tenant.members.manage',
    'projects.read',
    'projects.create',
    'projects.update',
    'projects.archive',
    'projects.members.manage',
    'logs.search',
    'logs.analytics',
    'ingestion.credentials.read',
    'ingestion.credentials.create',
    'ingestion.credentials.rotate',
    'ingestion.credentials.revoke',
    'quotas.read',
    'retention.read',
    'audit.read',
  ],

  ProjectAdmin: [
    'projects.read',
    'projects.update',
    'projects.members.manage',
    'logs.search',
    'logs.analytics',
    'ingestion.credentials.read',
    'ingestion.credentials.create',
    'ingestion.credentials.rotate',
    'ingestion.credentials.revoke',
    'quotas.read',
    'retention.read',
  ],

  Developer: [
    'projects.read',
    'logs.search',
    'logs.analytics',
    'ingestion.credentials.read',
    'ingestion.credentials.rotate',
    'quotas.read',
    'retention.read',
  ],

  Viewer: [
    'projects.read',
    'logs.search',
    'logs.analytics',
  ],
};

/**
 * Helper to determine if a role possesses a specific capability.
 */
export function roleHasCapability(role: SystemRole, capability: AdminCapability): boolean {
  return RBAC_ROLE_CAPABILITIES[role]?.includes(capability) ?? false;
}
