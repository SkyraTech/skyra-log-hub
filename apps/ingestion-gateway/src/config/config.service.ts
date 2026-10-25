import { Injectable, Optional } from '@nestjs/common';
import type { GatewayConfig } from './config.interface.js';

@Injectable()
export class GatewayConfigService {
  private readonly config: GatewayConfig;

  constructor(@Optional() env?: Record<string, string | undefined>) {
    const activeEnv = env ?? process.env;
    const nodeEnv = (activeEnv['NODE_ENV'] || 'development') as 'development' | 'production' | 'test';
    if (!['development', 'production', 'test'].includes(nodeEnv)) {
      throw new Error(`Invalid NODE_ENV: '${nodeEnv}'. Must be development, production, or test.`);
    }

    const host = activeEnv['HOST'] || '0.0.0.0';
    const rawPort = activeEnv['PORT'] || '4000';
    const port = Number.parseInt(rawPort, 10);
    if (Number.isNaN(port) || port <= 0 || port > 65535) {
      throw new Error(`Invalid PORT configuration: '${rawPort}'. Must be an integer between 1 and 65535.`);
    }

    const rawDatabaseUrl = activeEnv['DATABASE_URL'];
    if (nodeEnv === 'production') {
      if (!rawDatabaseUrl || rawDatabaseUrl.trim().length === 0 || rawDatabaseUrl.includes('REPLACE_ME')) {
        throw new Error('Production configuration error: Explicit, valid DATABASE_URL is required in production mode.');
      }
    }

    const databaseUrl = rawDatabaseUrl || 'postgresql://skyra_loghub_user:REPLACE_ME@localhost:5432/skyra_loghub_dev';

    if (databaseUrl && !databaseUrl.includes('REPLACE_ME')) {
      try {
        const parsed = new URL(databaseUrl);
        if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
          throw new Error(`Invalid DATABASE_URL protocol: '${parsed.protocol}'. Must be postgresql: or postgres:.`);
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.message.startsWith('Invalid DATABASE_URL protocol:')) {
          throw err;
        }
        throw new Error(`Invalid DATABASE_URL format: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const rawMaxBatch = activeEnv['MAX_BATCH_SIZE'] || '500';
    const maxBatchSize = Number.parseInt(rawMaxBatch, 10);
    if (Number.isNaN(maxBatchSize) || maxBatchSize < 1 || maxBatchSize > 5000) {
      throw new Error(`Invalid MAX_BATCH_SIZE: '${rawMaxBatch}'. Must be between 1 and 5000.`);
    }

    const rawMaxPayload = activeEnv['MAX_PAYLOAD_BYTES'] || '5242880'; // 5 MiB
    const maxPayloadBytes = Number.parseInt(rawMaxPayload, 10);
    if (Number.isNaN(maxPayloadBytes) || maxPayloadBytes < 1024) {
      throw new Error(`Invalid MAX_PAYLOAD_BYTES: '${rawMaxPayload}'. Must be at least 1024 bytes.`);
    }

    const rawDefaultRate = activeEnv['DEFAULT_RATE_LIMIT_PER_MINUTE'] || '600';
    const defaultRateLimitPerMin = Number.parseInt(rawDefaultRate, 10);
    if (Number.isNaN(defaultRateLimitPerMin) || defaultRateLimitPerMin < 1) {
      throw new Error(`Invalid DEFAULT_RATE_LIMIT_PER_MINUTE: '${rawDefaultRate}'.`);
    }

    const rawBurstRate = activeEnv['BURST_RATE_LIMIT_PER_MINUTE'] || '1200';
    const burstRateLimitPerMin = Number.parseInt(rawBurstRate, 10);
    if (Number.isNaN(burstRateLimitPerMin) || burstRateLimitPerMin < defaultRateLimitPerMin) {
      throw new Error(`Invalid BURST_RATE_LIMIT_PER_MINUTE: '${rawBurstRate}'. Must be >= DEFAULT_RATE_LIMIT_PER_MINUTE.`);
    }

    const rawCors = activeEnv['CORS_ORIGINS'] || 'http://localhost:3000,http://localhost:4200';
    const corsOrigins = rawCors
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    // Durability backend is explicitly disabled in LOGHUB-ING-002
    const durabilityBackendEnabled = activeEnv['DURABILITY_BACKEND_ENABLED'] === 'true';

    const rawShutdownTimeout = activeEnv['SHUTDOWN_TIMEOUT_MS'] || '10000';
    const shutdownTimeoutMs = Number.parseInt(rawShutdownTimeout, 10);

    this.config = Object.freeze({
      nodeEnv,
      host,
      port,
      databaseUrl,
      maxBatchSize,
      maxPayloadBytes,
      defaultRateLimitPerMin,
      burstRateLimitPerMin,
      corsOrigins,
      durabilityBackendEnabled,
      shutdownTimeoutMs,
    });
  }

  get nodeEnv(): 'development' | 'production' | 'test' {
    return this.config.nodeEnv;
  }

  get host(): string {
    return this.config.host;
  }

  get port(): number {
    return this.config.port;
  }

  get databaseUrl(): string {
    return this.config.databaseUrl;
  }

  get maxBatchSize(): number {
    return this.config.maxBatchSize;
  }

  get maxPayloadBytes(): number {
    return this.config.maxPayloadBytes;
  }

  get defaultRateLimitPerMin(): number {
    return this.config.defaultRateLimitPerMin;
  }

  get burstRateLimitPerMin(): number {
    return this.config.burstRateLimitPerMin;
  }

  get corsOrigins(): readonly string[] {
    return this.config.corsOrigins;
  }

  get durabilityBackendEnabled(): boolean {
    return this.config.durabilityBackendEnabled;
  }

  get shutdownTimeoutMs(): number {
    return this.config.shutdownTimeoutMs;
  }

  get raw(): GatewayConfig {
    return this.config;
  }
}

export { GatewayConfigService as ConfigService };
