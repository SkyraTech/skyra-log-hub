import { Injectable, type OnModuleInit, type OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '../config/config.service.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(private readonly config: ConfigService) {
    super({
      datasources: {
        db: {
          url: config.databaseUrl,
        },
      },
    });
  }

  public async onModuleInit(): Promise<void> {
    // Only connect if DATABASE_URL is not the default unconfigured placeholder
    if (this.config.databaseUrl.includes('REPLACE_ME')) {
      this.logger.warn('PrismaService initialized with placeholder DATABASE_URL. Connection skipped.');
      return;
    }

    try {
      await this.$connect();
      this.logger.log('PrismaService connected to PostgreSQL database successfully.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`PrismaService connection failed (deferred/offline mode): ${msg}`);
    }
  }

  public async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  public async isHealthy(): Promise<boolean> {
    if (this.config.databaseUrl.includes('REPLACE_ME')) {
      return false;
    }
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
