/**
 * Test Gateway Helper for End-to-End Shipper Integration
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { parseStrictJson } from '@skyra/logger-core';
import { AppModule } from '@skyra/ingestion-gateway/dist/app.module.js';
import { HttpExceptionFilter } from '@skyra/ingestion-gateway/dist/common/filters/http-exception.filter.js';
import { InMemoryCredentialRepository } from '@skyra/ingestion-gateway/dist/metadata/repositories/in-memory-credential.repository.js';
import { InMemoryProjectRepository } from '@skyra/ingestion-gateway/dist/metadata/repositories/in-memory-project.repository.js';
import { InMemoryTenantRepository } from '@skyra/ingestion-gateway/dist/metadata/repositories/in-memory-tenant.repository.js';
import { InMemoryQuotaRepository } from '@skyra/ingestion-gateway/dist/metadata/repositories/in-memory-quota.repository.js';
import { WalJournalService } from '@skyra/ingestion-gateway/dist/storage/wal/wal-journal.service.js';
import { ArchiveWriterService } from '@skyra/ingestion-gateway/dist/storage/archive/archive-writer.service.js';
import { RECEIPT_REPOSITORY } from '@skyra/ingestion-gateway/dist/metadata/repositories/receipt.repository.interface.js';

export interface TestGatewayInstance {
  app: NestFastifyApplication;
  gatewayUrl: string;
  walDir: string;
  archiveDir: string;
  validToken: string;
  tenantId: string;
  projectId: string;
  walService: WalJournalService;
  archiveService: ArchiveWriterService;
  receiptRepo: any;
  close: () => Promise<void>;
}

export async function startTestGateway(): Promise<TestGatewayInstance> {
  const walDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyra-e2e-wal-'));
  const archiveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyra-e2e-arch-'));

  process.env['WAL_DIRECTORY'] = walDir;
  process.env['ARCHIVE_ROOT'] = archiveDir;
  process.env['DATABASE_URL'] = 'postgresql://REPLACE_ME';

  const validToken = 'sk_live_e2e_valid_token_001';
  const tokenHash = crypto.createHash('sha256').update(validToken).digest('hex');

  const tenantId = '00000000-0000-0000-0000-000000000001';
  const projectId = 'skyra-tech';

  const adapter = new FastifyAdapter({
    bodyLimit: 5 * 1024 * 1024,
    logger: false,
  });

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
    logger: false,
  });

  app.useGlobalFilters(new HttpExceptionFilter());

  await app.init();

  const fastifyInstance = app.getHttpAdapter().getInstance();
  fastifyInstance.removeContentTypeParser('application/json');
  fastifyInstance.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_req: any, body: string, done: any) => {
      try {
        if (!body || body.trim() === '') {
          done(null, {});
          return;
        }
        const parsed = parseStrictJson(body);
        done(null, parsed);
      } catch (err) {
        done(err);
      }
    }
  );

  await app.listen(0, '127.0.0.1');
  const gatewayUrl = `${await app.getUrl()}/ingest/v1/logs`;

  const credRepo = app.get(InMemoryCredentialRepository);
  const projRepo = app.get(InMemoryProjectRepository);
  const tenantRepo = app.get(InMemoryTenantRepository);
  const quotaRepo = app.get(InMemoryQuotaRepository);
  const walService = app.get(WalJournalService);
  const archiveService = app.get(ArchiveWriterService);
  const receiptRepo = app.get(RECEIPT_REPOSITORY);

  await tenantRepo.save({
    id: tenantId,
    code: 'skyra-internal',
    name: 'Skyra Internal Tech',
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await projRepo.save({
    id: projectId,
    tenantId,
    name: 'Skyra Tech Platform',
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await quotaRepo.save({
    id: 'quota-e2e',
    tenantId,
    projectId,
    maxBatchSize: 500,
    maxPayloadBytes: 5242880,
    maxEventsPerSec: 5000,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await credRepo.save({
    id: 'cred-e2e-001',
    tenantId,
    keyHash: tokenHash,
    keyPrefix: 'sk_live_e2e',
    description: 'E2E Valid Token',
    allowedProjects: [projectId],
    allowedEnvironments: ['production', 'test', 'development'],
    rateLimitPerMin: 10000,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 86400000),
    isRevoked: false,
    lastUsedAt: null,
  });

  const close = async () => {
    try {
      await app.close();
    } catch {
      // ignore
    }
    if (walDir && fs.existsSync(walDir)) {
      try {
        fs.rmSync(walDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
    if (archiveDir && fs.existsSync(archiveDir)) {
      try {
        fs.rmSync(archiveDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  };

  return {
    app,
    gatewayUrl,
    walDir,
    archiveDir,
    validToken,
    tenantId,
    projectId,
    walService,
    archiveService,
    receiptRepo,
    close,
  };
}
