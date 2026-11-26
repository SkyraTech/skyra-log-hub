import * as path from 'node:path';
import * as fs from 'node:fs';
import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import type { QueryServiceConfig, AuthMode } from './query-config.types.js';

@Injectable()
export class QueryConfigService {
  private readonly logger = new Logger(QueryConfigService.name);
  private readonly config: QueryServiceConfig;
  private readonly explicitJwtSecret: boolean;
  private readonly explicitJwksUri: boolean;
  private readonly explicitCorsOrigins: boolean;

  constructor(@Optional() @Inject('CONFIG_OVERRIDE') envOverride?: Partial<QueryServiceConfig>) {
    const rawEnv = process.env['NODE_ENV'] ?? 'development';
    if (!['production', 'test', 'development'].includes(rawEnv)) {
      throw new Error(`Invalid NODE_ENV: '${rawEnv}'. Expected development, test, or production.`);
    }
    const nodeEnv = rawEnv as 'development' | 'production' | 'test';
    this.explicitJwtSecret = process.env['JWT_SECRET_OR_PUBLIC_KEY'] !== undefined || envOverride?.jwtSecretOrPublicKey !== undefined;
    this.explicitJwksUri = process.env['JWKS_URI'] !== undefined || envOverride?.jwksUri !== undefined;
    this.explicitCorsOrigins = process.env['CORS_ORIGINS'] !== undefined || envOverride?.corsOrigins !== undefined;

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
    const corsEnv = process.env['CORS_ORIGINS'];
    const rawCors = corsEnv ?? '*';
    const corsOrigins = rawCors.split(',').map((s) => s.trim()).filter((s) => s.length > 0);

    const cursorSigningSecret =
      process.env['CURSOR_SIGNING_SECRET'] ??
      (nodeEnv === 'production'
        ? ''
        : 'skyra-cursor-signing-secret-key-32chars-minimum-entropy');
    const cursorSigningKeyId = process.env['CURSOR_SIGNING_KEY_ID'] ?? 'v1';
    const cursorTtlMs = Number.parseInt(process.env['CURSOR_TTL_MS'] ?? '86400000', 10); // 24h

    const parquetCacheEnabled = process.env['PARQUET_CACHE_ENABLED'] !== 'false';
    const parquetCacheRoot = process.env['PARQUET_CACHE_ROOT']
      ? path.resolve(process.env['PARQUET_CACHE_ROOT'])
      : path.resolve(archiveRoot, '..', 'derived-parquet');
    const parquetMaterializationEnabled = process.env['PARQUET_MATERIALIZATION_ENABLED'] !== 'false';
    const parquetMaxWorkers = Number.parseInt(process.env['PARQUET_MAX_WORKERS'] ?? '2', 10);
    const parquetVerifyChecksums = process.env['PARQUET_VERIFY_CHECKSUMS'] !== 'false';
    const rawSourceMode = (process.env['QUERY_SOURCE_MODE'] ?? 'hybrid').toLowerCase();
    const hybridSourceMode: 'hybrid' | 'jsonl_only' | 'parquet_only' =
      rawSourceMode === 'jsonl_only' || rawSourceMode === 'parquet_only' ? rawSourceMode : 'hybrid';

    const compactionEnabled = process.env['COMPACTION_ENABLED'] === 'true';
    const compactionIntervalMs = Number.parseInt(process.env['COMPACTION_INTERVAL_MS'] ?? '30000', 10);
    const compactionBatchSize = Number.parseInt(process.env['COMPACTION_BATCH_SIZE'] ?? '10', 10);
    const compactionMaxWorkers = Number.parseInt(process.env['COMPACTION_MAX_WORKERS'] ?? '2', 10);
    const compactionLockTtlMs = Number.parseInt(process.env['COMPACTION_LOCK_TTL_MS'] ?? '300000', 10);
    const compactionRetryBackoffMs = Number.parseInt(process.env['COMPACTION_RETRY_BACKOFF_MS'] ?? '5000', 10);
    const compactionMaxRetries = Number.parseInt(process.env['COMPACTION_MAX_RETRIES'] ?? '3', 10);
    const compactionDeferLegalHold = process.env['COMPACTION_DEFER_LEGAL_HOLD'] === 'true';

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
      corsOrigins: nodeEnv === 'production' ? corsOrigins : (corsOrigins.length > 0 ? corsOrigins : ['*']),
      cursorSigningSecret,
      cursorSigningKeyId,
      cursorTtlMs: isNaN(cursorTtlMs) ? 86400000 : cursorTtlMs,
      parquetCacheEnabled,
      parquetCacheRoot,
      parquetMaterializationEnabled,
      parquetMaxWorkers: isNaN(parquetMaxWorkers) ? 2 : parquetMaxWorkers,
      parquetVerifyChecksums,
      hybridSourceMode,
      compactionEnabled,
      compactionIntervalMs: isNaN(compactionIntervalMs) ? 30000 : compactionIntervalMs,
      compactionBatchSize: isNaN(compactionBatchSize) ? 10 : compactionBatchSize,
      compactionMaxWorkers: isNaN(compactionMaxWorkers) ? 2 : compactionMaxWorkers,
      compactionLockTtlMs: isNaN(compactionLockTtlMs) ? 300000 : compactionLockTtlMs,
      compactionRetryBackoffMs: isNaN(compactionRetryBackoffMs) ? 5000 : compactionRetryBackoffMs,
      compactionMaxRetries: isNaN(compactionMaxRetries) ? 3 : compactionMaxRetries,
      compactionDeferLegalHold,
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
      if (!this.explicitJwtSecret && this.config.authMode === 'jwt') {
        throw new Error('Fatal Configuration Error: JWT_SECRET_OR_PUBLIC_KEY must be explicitly configured in production.');
      }
      if (this.config.authMode === 'jwt' && this.isPlaceholderSecret(this.config.jwtSecretOrPublicKey)) {
        throw new Error('Fatal Configuration Error: JWT_SECRET_OR_PUBLIC_KEY cannot use a development or placeholder value in production.');
      }
      if (this.config.authMode === 'jwks') {
        if (!this.explicitJwksUri || !this.config.jwksUri) throw new Error('Fatal Configuration Error: JWKS_URI must be explicitly configured in production.');
        const jwks = new URL(this.config.jwksUri);
        if (jwks.protocol !== 'https:' || jwks.username || jwks.password || jwks.hash) {
          throw new Error('Fatal Configuration Error: JWKS_URI must be a credential-free HTTPS URL in production.');
        }
      }
      if (!this.explicitCorsOrigins || this.config.corsOrigins.includes('*')) {
        throw new Error('Fatal Configuration Error: production Query CORS requires explicit non-wildcard CORS_ORIGINS.');
      }
      for (const origin of this.config.corsOrigins) {
        const parsed = new URL(origin);
        if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
          throw new Error('Fatal Configuration Error: production CORS origins must be credential-free HTTPS origins.');
        }
      }
      if (!this.config.cursorSigningSecret || this.config.cursorSigningSecret.length < 32) {
        throw new Error('Fatal Configuration Error: CURSOR_SIGNING_SECRET must be set to a high-entropy secret of at least 32 characters in production.');
      }
      if (!fs.existsSync(this.config.archiveRoot)) {
        this.logger.warn(`Archive root directory does not exist yet at: ${this.config.archiveRoot}. Will be created or expected on mount.`);
      }
    }
  }

  private isPlaceholderSecret(value: string): boolean {
    const normalized = value.trim().toLowerCase();
    return normalized.length < 32 || normalized === 'skyra-dev-query-insecure-secret-key-32chars' ||
      normalized === 'change-me' || normalized === 'replace-me' || normalized === 'test-secret' ||
      /^(dev|development|test|example|default|change|replace)[-_ ]/i.test(normalized);
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

  public get cursorSigningSecret(): string {
    return this.config.cursorSigningSecret;
  }

  public get cursorSigningKeyId(): string {
    return this.config.cursorSigningKeyId;
  }

  public get cursorTtlMs(): number {
    return this.config.cursorTtlMs;
  }

  public get parquetCacheEnabled(): boolean {
    return this.config.parquetCacheEnabled;
  }

  public get parquetCacheRoot(): string {
    return this.config.parquetCacheRoot;
  }

  public get parquetMaterializationEnabled(): boolean {
    return this.config.parquetMaterializationEnabled;
  }

  public get parquetMaxWorkers(): number {
    return this.config.parquetMaxWorkers;
  }

  public get parquetVerifyChecksums(): boolean {
    return this.config.parquetVerifyChecksums;
  }

  public get hybridSourceMode(): 'hybrid' | 'jsonl_only' | 'parquet_only' {
    return this.config.hybridSourceMode;
  }

  public get compactionEnabled(): boolean {
    return this.config.compactionEnabled;
  }

  public get compactionIntervalMs(): number {
    return this.config.compactionIntervalMs;
  }

  public get compactionBatchSize(): number {
    return this.config.compactionBatchSize;
  }

  public get compactionMaxWorkers(): number {
    return this.config.compactionMaxWorkers;
  }

  public get compactionLockTtlMs(): number {
    return this.config.compactionLockTtlMs;
  }

  public get compactionRetryBackoffMs(): number {
    return this.config.compactionRetryBackoffMs;
  }

  public get compactionMaxRetries(): number {
    return this.config.compactionMaxRetries;
  }

  public get compactionDeferLegalHold(): boolean {
    return this.config.compactionDeferLegalHold;
  }

  public isProduction(): boolean {
    return this.config.nodeEnv === 'production';
  }
}
