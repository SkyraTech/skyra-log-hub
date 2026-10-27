export type UserRole = 'OrgOwner' | 'OrgAdmin' | 'ProjectAdmin' | 'Developer' | 'Viewer';

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  roles: UserRole[];
  tenantId: string;
  allowedProjects: string[];
}

export interface AuthSession {
  isAuthenticated: boolean;
  user: UserProfile | null;
  expiresAt: string | null;
  idleExpiresAt?: string | null;
  csrfToken?: string | null;
  isPreviewSession: boolean;
}

export interface BffSessionDto {
  authenticated: boolean;
  user?: {
    id: string;
    email: string;
    name: string;
    roles: string[];
  };
  activeTenantId?: string;
  activeProjectId?: string;
  availableTenants: Array<{ tenantId: string; tenantName: string }>;
  availableProjects: Array<{
    projectId: string;
    projectName: string;
    roles: string[];
    allowedEnvironments?: string[];
  }>;
  csrfToken: string;
  expiresAt: string;
  idleExpiresAt: string;
}

export interface AuthBroadcastMessage {
  type: 'AUTH_LOGOUT' | 'AUTH_LOGIN' | 'WORKSPACE_SWITCHED';
  tenantId?: string;
  projectId?: string;
  timestamp: number;
}
