export type SystemRole = 'OrgOwner' | 'OrgAdmin' | 'ProjectAdmin' | 'Developer' | 'Viewer';

export interface RoleDefinition {
  id: string;
  name: SystemRole;
  description: string;
  isSystem: boolean;
}

export const SYSTEM_ROLES: Record<SystemRole, { description: string; rank: number }> = {
  OrgOwner: {
    description: 'Full administrative and financial control over the entire tenant organization.',
    rank: 5,
  },
  OrgAdmin: {
    description: 'Administrative access to manage team members, projects, and ingestion settings across the tenant.',
    rank: 4,
  },
  ProjectAdmin: {
    description: 'Administration of designated projects, credentials, and project-specific alerts.',
    rank: 3,
  },
  Developer: {
    description: 'Read-write operational access to view logs, analytics, and manage dev/staging credentials.',
    rank: 2,
  },
  Viewer: {
    description: 'Read-only access to view logs and analytical dashboards without mutation capabilities.',
    rank: 1,
  },
};
