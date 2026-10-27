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
  isPreviewSession: boolean;
}
