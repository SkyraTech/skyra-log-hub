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
  maxScannedBytesPerQuery: number;
  duckDbMaxMemoryMb: number;
  duckDbThreads: number;
  maxRowsPerQuery: number;
  enableAuditLogging: boolean;
  corsOrigins: string[];
  cursorSigningSecret: string;
  cursorSigningKeyId: string;
  cursorTtlMs: number;
  parquetCacheEnabled: boolean;
  parquetCacheRoot: string;
  parquetMaterializationEnabled: boolean;
  parquetMaxWorkers: number;
  parquetVerifyChecksums: boolean;
  hybridSourceMode: 'hybrid' | 'jsonl_only' | 'parquet_only';
}
