import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'node:fs/promises';
import { PrismaService } from '../../metadata/prisma.service.js';
import { QueryConfigService } from '../../config/query-config.service.js';

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'unhealthy';
  service: string;
  timestamp: string;
  uptimeSeconds: number;
}

export interface ReadinessStatus {
  status: 'ready' | 'not_ready';
  service: string;
  timestamp: string;
  checks: {
    database: 'up' | 'down' | 'unconfigured';
    archiveStorage: 'up' | 'down';
  };
  details?: Record<string, string>;
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  private readonly startTime = Date.now();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: QueryConfigService,
  ) {}

  public getLiveness(): HealthStatus {
    return {
      status: 'ok',
      service: 'skyra-query-service',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
    };
  }

  public async getReadiness(): Promise<ReadinessStatus> {
    const timestamp = new Date().toISOString();
    let dbStatus: 'up' | 'down' | 'unconfigured' = 'unconfigured';
    let storageStatus: 'up' | 'down' = 'down';
    const details: Record<string, string> = {};

    // 1. Check Database
    if (this.config.databaseUrl.includes('REPLACE_ME')) {
      dbStatus = 'unconfigured';
      details.database = 'Database URL not configured (placeholder detected)';
    } else {
      const isDbHealthy = await this.prisma.isHealthy();
      dbStatus = isDbHealthy ? 'up' : 'down';
      if (!isDbHealthy) {
        details.database = 'Database ping failed';
      }
    }

    // 2. Check Archive Root Storage
    try {
      await fs.access(this.config.archiveRoot);
      storageStatus = 'up';
    } catch (err: unknown) {
      storageStatus = 'down';
      const msg = err instanceof Error ? err.message : String(err);
      details.archiveStorage = `Archive root inaccessible: ${msg}`;
    }

    // In production, both DB and storage must be up.
    // In dev/test with unconfigured DB, readiness depends on storage unless strict.
    const isReady =
      storageStatus === 'up' &&
      (dbStatus === 'up' || (dbStatus === 'unconfigured' && this.config.nodeEnv !== 'production'));

    return {
      status: isReady ? 'ready' : 'not_ready',
      service: 'skyra-query-service',
      timestamp,
      checks: {
        database: dbStatus,
        archiveStorage: storageStatus,
      },
      ...(Object.keys(details).length > 0 ? { details } : {}),
    };
  }
}
