import * as path from 'node:path';
import * as fs from 'node:fs';
import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import type { QueryServiceConfig, AuthMode } from './query-config.types.js';

@Injectable()
export class QueryConfigService {
  private readonly logger = new Logger(QueryConfigService.name);
  private readonly config: QueryServiceConfig;

  constructor(@Optional() @Inject('CONFIG_OVERRIDE') envOverride?: Partial<QueryServiceConfig>) {
    const rawEnv = process.env['NODE_ENV'] ?? 'development';
    const nodeEnv = (['production', 'test', 'development'].includes(rawEnv)
      ? rawEnv
      : 'development') as 'development' | 'production' | 'test';

    const port = Number.parseInt(process.env['PORT'] ?? '3100', 10);
    const host = process.env['HOST'] ?? '127.0.0.1';
    const databaseUrl = process.env['DATABASE_URL'] ?? 'postgresql://skyra_loghub_user:REPLACE_ME@127.0.0.1:5432/skyra_loghub_dev?schema=public';
    const archiveRoot = process.env['ARCHIVE_ROOT']
      ? path.resolve(process.env['ARCHIVE_ROOT'])
      : path.resolve(process.cwd(), 'data', 'archive');

    const rawAuthMode = (process.env['QUERY_AUTH_MODE'] ?? (nodeEnv === 'production' ? 'jwt' : 'test')).toLowerCase();
    const authMode: AuthMode = ['test', 'jwt', 'jwks'].includes(rawAuthMode) ? (rawAuthMode as AuthMode) : 'test';

    const jwtIssuer = process.env['JWT_ISSUER'] ?? 'https://auth.skyra.internal';
    const jwtAudience = process.env['JWT_AUDIENCE'] ?? 'skyra-loghub-query';
    const jwtSecretOrPublicKey = process.env['JWT_SECRET_OR_PUBLIC_KEY'] ?? 'skyra-dev-query-insecure-secret-key-32chars';
    const jwksUri = process.env['JWKS_URI'];

    const queryTimeoutMs = Number.parseInt(process.env['QUERY_TIMEOUT_MS'] ?? '30000', 10);
    const maxSegmentsPerQuery = Number.parseInt(process.env['MAX_SEGMENTS_PER_QUERY'] ?? '500', 10);
    const maxTimeRangeDays = Number.parseInt(process.env['MAX_TIME_RANGE_DAYS'] ?? '30', 10);
    const maxScannedBytesPerQuery = Number.parseInt(process.env['MAX_SCANNED_BYTES_PER_QUERY'] ?? '524288000', 10); // 500MB
    const duckDbMaxMemoryMb = Number.parseInt(process.env['DUCKDB_MAX_MEMORY_MB'] ?? '256', 10);
    const duckDbThreads = Number.parseInt(process.env['DUCKDB_THREADS'] ?? '2', 10);
    const maxRowsPerQuery = Number.parseInt(process.env['MAX_ROWS_PER_QUERY'] ?? '500', 10);
    const enableAuditLogging = process.env['ENABLE_AUDIT_LOGGING'] !== 'false';
    const rawCors = process.env['CORS_ORIGINS'] ?? '*';
    const corsOrigins = rawCors.split(',').map((s) => s.trim()).filter((s) => s.length > 0);

    this.config = {
      nodeEnv,
      port: isNaN(port) ? 3100 : port,
      host,
      databaseUrl,
      archiveRoot,
      authMode,
      jwtIssuer,
      jwtAudience,
      jwtSecretOrPublicKey,
      jwksUri,
      queryTimeoutMs: isNaN(queryTimeoutMs) ? 30000 : queryTimeoutMs,
      maxSegmentsPerQuery: isNaN(maxSegmentsPerQuery) ? 500 : maxSegmentsPerQuery,
      maxTimeRangeDays: isNaN(maxTimeRangeDays) ? 30 : maxTimeRangeDays,
      maxScannedBytesPerQuery: isNaN(maxScannedBytesPerQuery) ? 524288000 : maxScannedBytesPerQuery,
      duckDbMaxMemoryMb: isNaN(duckDbMaxMemoryMb) ? 256 : duckDbMaxMemoryMb,
      duckDbThreads: isNaN(duckDbThreads) ? 2 : duckDbThreads,
      maxRowsPerQuery: isNaN(maxRowsPerQuery) ? 500 : maxRowsPerQuery,
      enableAuditLogging,
      corsOrigins: corsOrigins.length > 0 ? corsOrigins : ['*'],
      ...envOverride,
    };

    this.validateConfig();
  }

  private validateConfig(): void {
    if (this.config.nodeEnv === 'production') {
      if (this.config.databaseUrl.includes('REPLACE_ME')) {
        throw new Error('Fatal Configuration Error: Production startup requires a valid, non-placeholder DATABASE_URL.');
      }
      if (this.config.authMode === 'test') {
        throw new Error('Fatal Configuration Error: QUERY_AUTH_MODE cannot be "test" in production environment.');
      }
      if (!fs.existsSync(this.config.archiveRoot)) {
        this.logger.warn(`Archive root directory does not exist yet at: ${this.config.archiveRoot}. Will be created or expected on mount.`);
      }
    }
  }

  public get nodeEnv(): 'development' | 'production' | 'test' {
    return this.config.nodeEnv;
  }

  public get port(): number {
    return this.config.port;
  }

  public get host(): string {
    return this.config.host;
  }

  public get databaseUrl(): string {
    return this.config.databaseUrl;
  }

  public get archiveRoot(): string {
    return this.config.archiveRoot;
  }

  public get authMode(): AuthMode {
    return this.config.authMode;
  }

  public get jwtIssuer(): string {
    return this.config.jwtIssuer;
  }

  public get jwtAudience(): string {
    return this.config.jwtAudience;
  }

  public get jwtSecretOrPublicKey(): string {
    return this.config.jwtSecretOrPublicKey;
  }

  public get jwksUri(): string | undefined {
    return this.config.jwksUri;
  }

  public get queryTimeoutMs(): number {
    return this.config.queryTimeoutMs;
  }

  public get maxSegmentsPerQuery(): number {
    return this.config.maxSegmentsPerQuery;
  }

  public get maxTimeRangeDays(): number {
    return this.config.maxTimeRangeDays;
  }

  public get maxScannedBytesPerQuery(): number {
    return this.config.maxScannedBytesPerQuery;
  }

  public get duckDbMaxMemoryMb(): number {
    return this.config.duckDbMaxMemoryMb;
  }

  public get duckDbThreads(): number {
    return this.config.duckDbThreads;
  }

  public get maxRowsPerQuery(): number {
    return this.config.maxRowsPerQuery;
  }

  public get enableAuditLogging(): boolean {
    return this.config.enableAuditLogging;
  }

  public get corsOrigins(): string[] {
    return this.config.corsOrigins;
  }

  public isProduction(): boolean {
    return this.config.nodeEnv === 'production';
  }
}
