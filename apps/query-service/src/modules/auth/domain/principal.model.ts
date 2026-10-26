export type QueryRole = 'viewer' | 'analyst' | 'admin';

export interface QueryPrincipal {
  readonly sub: string;                   // Subject (User ID or service account ID)
  readonly tenantId: string;              // Authoritative home tenant ID
  readonly authorizedProjects: readonly string[]; // Allowed project IDs (or ['*'] for all within tenant)
  readonly allowedEnvironments: readonly string[]; // e.g. ['production', 'staging', 'development']
  readonly roles: readonly QueryRole[];
  readonly iss: string;                   // Token issuer
  readonly aud: string;                   // Audience
  readonly exp: number;                   // Expiration epoch seconds
  readonly nbf?: number;                  // Not-before epoch seconds
  readonly iat?: number;                  // Issued-at epoch seconds
}
