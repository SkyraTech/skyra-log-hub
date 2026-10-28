export interface BffConfig {
  host: string;
  port: number;
  nodeEnv: string;
  queryServiceUrl: string;
  queryServiceJwtSecret: string;
  queryServiceJwtIssuer: string;
  queryServiceJwtAudience: string;
  sessionCookieName: string;
  sessionSecret: string;
  sessionIdleTimeoutMs: number;
  sessionAbsoluteLifetimeMs: number;
  cookieSecure: boolean;
  cookieSameSite: 'lax' | 'strict' | 'none';
  csrfSecret: string;
  allowedOrigins: string[];
  oidcIssuerUrl: string;
  oidcClientId: string;
  oidcClientSecret: string;
  oidcRedirectUri: string;
  oidcScopes: string[];
  mockOidcEnabled: boolean;
  adminServiceUrl: string;
  useAuthoritativeMembership: boolean;
}
