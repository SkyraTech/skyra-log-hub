export interface UserProfile {
  id: string;
  email: string;
  name: string;
  roles: string[];
}

export interface ProjectMembership {
  projectId: string;
  projectName: string;
  roles: string[];
  allowedEnvironments: string[];
}

export interface WorkspaceMembership {
  tenantId: string;
  tenantName: string;
  projects: ProjectMembership[];
}

export interface BffSession {
  sessionId: string;
  user: UserProfile;
  memberships: WorkspaceMembership[];
  createdAt: Date;
  lastActivityAt: Date;
  csrfToken: string;
  activeTenantId?: string;
  activeProjectId?: string;
  idToken?: string;
  accessToken?: string;
  refreshToken?: string;
}

export interface SafeSessionDto {
  authenticated: boolean;
  user?: UserProfile;
  activeTenantId?: string;
  activeProjectId?: string;
  availableTenants: Array<{ tenantId: string; tenantName: string }>;
  availableProjects: ProjectMembership[];
  csrfToken: string;
  expiresAt: string;
  idleExpiresAt: string;
}
