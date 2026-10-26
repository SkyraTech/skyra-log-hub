export type AuthMode = 'test' | 'jwt' | 'jwks';

export interface QueryServiceConfig {
  nodeEnv: 'development' | 'production' | 'test';
  port: number;
  host: string;
  databaseUrl: string;
  archiveRoot: string;
  authMode: AuthMode;
  jwtIssuer: string;
  jwtAudience: string;
  jwtSecretOrPublicKey: string;
  jwksUri?: string;
  queryTimeoutMs: number;
  maxSegmentsPerQuery: number;
  maxTimeRangeDays: number;
  enableAuditLogging: boolean;
  corsOrigins: string[];
}
