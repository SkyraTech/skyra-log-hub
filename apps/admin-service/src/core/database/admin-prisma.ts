import { PrismaClient } from '@prisma/client';
import { AdminConfigService } from '../config/admin-config.service.js';
import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { MembershipProviderUnavailableException } from '../errors/admin.errors.js';

const clients = new WeakMap<AdminConfigService, PrismaClient>();
export function adminPrisma(config: AdminConfigService): PrismaClient {
  if (!config.persistenceEnabled || !config.databaseUrl) {
    throw new MembershipProviderUnavailableException('Administration persistence is not activated.');
  }
  let client = clients.get(config);
  if (!client) {
    client = new PrismaClient({ datasources: { db: { url: config.databaseUrl } } });
    clients.set(config, client);
  }
  return client;
}

@Injectable()
export class AdminDatabaseLifecycle implements OnModuleDestroy {
  constructor(private readonly config: AdminConfigService) {}
  async onModuleDestroy() { await clients.get(this.config)?.$disconnect(); }
}
