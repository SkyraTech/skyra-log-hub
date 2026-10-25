export interface AuthenticatedIdentity {
  credentialId: string;
  tenantId: string;
  allowedProjects: string[];
  allowedEnvironments: string[];
  rateLimitPerMin: number;
}
