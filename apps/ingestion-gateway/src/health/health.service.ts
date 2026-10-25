import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../metadata/prisma.service.js';
import { WalJournalService } from '../storage/wal/wal-journal.service.js';
import { GatewayConfigService } from '../config/config.service.js';

export interface LivenessResponse {
  status: 'ok';
  timestamp: string;
}

export interface ReadinessResponse {
  status: 'not_ready' | 'ok';
  durability_backend: 'unavailable' | 'ready';
  database: 'connected' | 'offline_mock' | 'disconnected';
  reason?: string;
  timestamp: string;
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly walService?: WalJournalService,
    @Optional() private readonly configService?: GatewayConfigService,
  ) {}

  public getLiveness(): LivenessResponse {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  public async getReadiness(): Promise<ReadinessResponse> {
    const isDbHealthy = await this.prisma.isHealthy();
    const isProd =
      this.configService?.nodeEnv === 'production' || process.env['NODE_ENV'] === 'production';
    const dbStatus = isDbHealthy ? 'connected' : isProd ? 'disconnected' : 'offline_mock';

    // 1. In production, database connectivity is mandatory
    if (isProd && !isDbHealthy) {
      return {
        status: 'not_ready',
        durability_backend: this.walService?.getStatus().isReady ? 'ready' : 'unavailable',
        database: 'disconnected',
        reason: 'PostgreSQL database connection is required in production mode and is currently unavailable',
        timestamp: new Date().toISOString(),
      };
    }

    // 2. Check WAL journal readiness and recovery-required state
    const walStatus = this.walService?.getStatus();
    if (walStatus?.isRecoveryRequired) {
      return {
        status: 'not_ready',
        durability_backend: 'unavailable',
        database: dbStatus,
        reason: walStatus.recoveryError || 'WAL journal corruption detected; recovery required',
        timestamp: new Date().toISOString(),
      };
    }

    const isWalReady = walStatus?.isReady ?? false;
    if (!isWalReady) {
      return {
        status: 'not_ready',
        durability_backend: 'unavailable',
        database: dbStatus,
        reason: walStatus?.recoveryError || 'Durable WAL journal engine is not yet attached or not ready',
        timestamp: new Date().toISOString(),
      };
    }

    return {
      status: 'ok',
      durability_backend: 'ready',
      database: dbStatus,
      timestamp: new Date().toISOString(),
    };
  }
}
