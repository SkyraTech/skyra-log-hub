import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { parseStrictJson } from '@skyra/logger-core';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { AppModule } from '../../src/app.module.js';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter.js';
import { InMemoryCredentialRepository } from '../../src/metadata/repositories/in-memory-credential.repository.js';
import { InMemoryProjectRepository } from '../../src/metadata/repositories/in-memory-project.repository.js';
import { InMemoryTenantRepository } from '../../src/metadata/repositories/in-memory-tenant.repository.js';
import { createValidLogEvent } from '../fixtures/valid-event.fixture.js';

describe('Ingestion Gateway Security Hardening Tests', () => {
  let app: NestFastifyApplication;
  let credRepo: InMemoryCredentialRepository;
  let projRepo: InMemoryProjectRepository;
  let tenantRepo: InMemoryTenantRepository;
  let walDir: string;
  let archiveDir: string;

  const validToken = 'sk_live_secret_security_test_token_999999';
  const tokenHash = crypto.createHash('sha256').update(validToken).digest('hex');

  const tenantAId = '00000000-0000-0000-0000-000000000001';
  const tenantBId = '00000000-0000-0000-0000-000000000002';
  const projectAId = 'skyra-project-a';
  const projectBId = 'skyra-project-b';

  before(async () => {
    walDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyra-security-wal-'));
    archiveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyra-security-arch-'));
    process.env['WAL_DIRECTORY'] = walDir;
    process.env['ARCHIVE_ROOT'] = archiveDir;
    process.env['DATABASE_URL'] = 'postgresql://REPLACE_ME@127.0.0.1:5432/REPLACE_ME';

    const adapter = new FastifyAdapter({
      bodyLimit: 5 * 1024 * 1024,
      logger: false,
    });

    app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
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
      },
    );

    await app.getHttpAdapter().getInstance().ready();

    credRepo = app.get(InMemoryCredentialRepository);
    projRepo = app.get(InMemoryProjectRepository);
    tenantRepo = app.get(InMemoryTenantRepository);

    // Setup Tenant A and Tenant B
    await tenantRepo.save({
      id: tenantAId,
      code: 'tenant-a',
      name: 'Tenant Alpha',
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await tenantRepo.save({
      id: tenantBId,
      code: 'tenant-b',
      name: 'Tenant Beta',
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Project A belongs to Tenant A
    await projRepo.save({
      id: projectAId,
      tenantId: tenantAId,
      name: 'Alpha Project',
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Project B belongs to Tenant B
    await projRepo.save({
      id: projectBId,
      tenantId: tenantBId,
      name: 'Beta Project',
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Credential for Tenant A
    await credRepo.save({
      id: 'cred-tenant-a',
      tenantId: tenantAId,
      keyHash: tokenHash,
      keyPrefix: 'sk_live_sec',
      description: 'Tenant A Credential',
      allowedProjects: [projectAId],
      allowedEnvironments: ['production'],
      rateLimitPerMin: 600,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 86400000),
      isRevoked: false,
      lastUsedAt: null,
    });
  });

  after(async () => {
    if (app) {
      await app.close();
    }
    if (walDir && fs.existsSync(walDir)) {
      try {
        fs.rmSync(walDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup error
      }
    }
    if (archiveDir && fs.existsSync(archiveDir)) {
      try {
        fs.rmSync(archiveDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup error
      }
    }
  });

  it('Security: Token leakage prevention — token is never echoed in error response', async () => {
    const rawSecret = 'sk_live_super_secret_never_leak_me_1234567890';
    const res = await app.inject({
      method: 'POST',
      url: '/ingest/v1/logs',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${rawSecret}`,
      },
      payload: JSON.stringify({
        protocol_version: '1.0',
        sent_at: '2026-10-24T00:00:00.000Z',
        events: [createValidLogEvent()],
      }),
    });

    assert.equal(res.statusCode, 401);
    const body = res.payload;
    assert.ok(!body.includes(rawSecret), 'Response body must not contain bearer token value');
  });

  it('Security: Cross-tenant injection attack is strictly rejected', async () => {
    // Authenticated as Tenant A, but event payload specifies project belonging to Tenant B
    const attackEvent = createValidLogEvent({ projectId: projectBId });

    const res = await app.inject({
      method: 'POST',
      url: '/ingest/v1/logs',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${validToken}`,
      },
      payload: JSON.stringify({
        protocol_version: '1.0',
        batch_id: crypto.randomUUID(),
        sent_at: '2026-10-24T00:00:00.000Z',
        events: [attackEvent],
      }),
    });

    assert.equal(res.statusCode, 403);
    const parsed = JSON.parse(res.payload);
    assert.equal(parsed.error.code, 'PROJECT_ACCESS_DENIED');
  });

  it('Security: Prototype pollution attempt via payload does not pollute Object prototype', async () => {
    const maliciousPayload = JSON.stringify({
      protocol_version: '1.0',
      sent_at: '2026-10-24T00:00:00.000Z',
      __proto__: { polluted: 'yes' },
      events: [createValidLogEvent()],
    });

    await app.inject({
      method: 'POST',
      url: '/ingest/v1/logs',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${validToken}`,
      },
      payload: maliciousPayload,
    });

    assert.equal((Object.prototype as any).polluted, undefined, 'Object.prototype must not be polluted');
  });

  it('Security: Duplicate key injection attack is rejected with HTTP 400', async () => {
    // Attempting to inject dual project_id or shadow fields
    const attackPayload = `{"protocol_version":"1.0","protocol_version":"1.0","sent_at":"2026-10-24T00:00:00.000Z","events":[]}`;

    const res = await app.inject({
      method: 'POST',
      url: '/ingest/v1/logs',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${validToken}`,
      },
      payload: attackPayload,
    });

    assert.equal(res.statusCode, 400);
    const parsed = JSON.parse(res.payload);
    assert.equal(parsed.error.code, 'INVALID_JSON');
  });

  it('Security: Oversized body rejection — payload exceeding Fastify bodyLimit returns HTTP 413', async () => {
    // 6 MiB payload exceeds 5 MiB body limit
    const hugeMessage = 'A'.repeat(6 * 1024 * 1024);
    const hugePayload = JSON.stringify({
      protocol_version: '1.0',
      sent_at: '2026-10-24T00:00:00.000Z',
      events: [createValidLogEvent({ overrides: { message: hugeMessage } })],
    });

    const res = await app.inject({
      method: 'POST',
      url: '/ingest/v1/logs',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${validToken}`,
      },
      payload: hugePayload,
    });

    assert.equal(res.statusCode, 413);
    const parsed = JSON.parse(res.payload);
    assert.equal(parsed.error.code, 'PAYLOAD_TOO_LARGE');
  });
});
