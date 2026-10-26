import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { parseStrictJson } from '@skyra/logger-core';
import { AppModule } from '../../src/app.module.js';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter.js';
import { InMemoryCredentialRepository } from '../../src/metadata/repositories/in-memory-credential.repository.js';
import { InMemoryProjectRepository } from '../../src/metadata/repositories/in-memory-project.repository.js';
import { InMemoryTenantRepository } from '../../src/metadata/repositories/in-memory-tenant.repository.js';
import { InMemoryQuotaRepository } from '../../src/metadata/repositories/in-memory-quota.repository.js';
import { WalJournalService } from '../../src/storage/wal/wal-journal.service.js';
import { createValidLogEvent } from '../fixtures/valid-event.fixture.js';

describe('Ingestion Gateway Real Fastify HTTP Integration Tests (LOGHUB-ING-003)', () => {
  let app: NestFastifyApplication;
  let credRepo: InMemoryCredentialRepository;
  let projRepo: InMemoryProjectRepository;
  let tenantRepo: InMemoryTenantRepository;
  let quotaRepo: InMemoryQuotaRepository;
  let walService: WalJournalService;

  const validToken = 'sk_live_integration_token_test_abc123';
  const validTokenHash = crypto.createHash('sha256').update(validToken).digest('hex');

  const revokedToken = 'sk_live_revoked_token_test_xyz789';
  const revokedTokenHash = crypto.createHash('sha256').update(revokedToken).digest('hex');

  const expiredToken = 'sk_live_expired_token_test_exp000';
  const expiredTokenHash = crypto.createHash('sha256').update(expiredToken).digest('hex');

  const tenantId = '00000000-0000-0000-0000-000000000001';
  const projectId = 'skyra-tech';

  let walDir: string;
  let archiveDir: string;

  before(async () => {
    try {
      walDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyra-integ-wal-'));
      archiveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyra-integ-arch-'));
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

      // Register Fastify strict JSON parser
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

      // Populate mock metadata
      credRepo = app.get(InMemoryCredentialRepository);
      projRepo = app.get(InMemoryProjectRepository);
      tenantRepo = app.get(InMemoryTenantRepository);
      quotaRepo = app.get(InMemoryQuotaRepository);
      walService = app.get(WalJournalService);

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
        id: 'quota-001',
        tenantId,
        projectId,
        maxBatchSize: 500,
        maxPayloadBytes: 5242880,
        maxEventsPerSec: 5000,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await credRepo.save({
        id: 'cred-valid',
        tenantId,
        keyHash: validTokenHash,
        keyPrefix: 'sk_live_valid',
        description: 'Valid Integration Credential',
        allowedProjects: [projectId],
        allowedEnvironments: ['production'],
        rateLimitPerMin: 1000,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
        isRevoked: false,
        lastUsedAt: null,
      });

      await credRepo.save({
        id: 'cred-revoked',
        tenantId,
        keyHash: revokedTokenHash,
        keyPrefix: 'sk_live_revoked',
        description: 'Revoked Credential',
        allowedProjects: [projectId],
        allowedEnvironments: ['production'],
        rateLimitPerMin: 10,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
        isRevoked: true,
        lastUsedAt: null,
      });

      await credRepo.save({
        id: 'cred-expired',
        tenantId,
        keyHash: expiredTokenHash,
        keyPrefix: 'sk_live_expired',
        description: 'Expired Credential',
        allowedProjects: [projectId],
        allowedEnvironments: ['production'],
        rateLimitPerMin: 10,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() - 3600000),
        isRevoked: false,
        lastUsedAt: null,
      });
    } catch (err) {
      console.error('FATAL BEFORE HOOK ERROR:', err);
      throw err;
    }
  });

  after(async () => {
    if (app) {
      await app.close();
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
  });

  it('GET /health/live returns 200 OK', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health/live',
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.status, 'ok');
    assert.ok(body.timestamp);
  });

  it('GET /health/ready returns 200 OK (durability backend ready)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health/ready',
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.status, 'ok');
    assert.equal(body.durability_backend, 'ready');
  });

  it('POST /ingest/v1/logs without Authorization returns 401 UNAUTHORIZED', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/ingest/v1/logs',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({
        protocol_version: '1.0',
        batch_id: crypto.randomUUID(),
        sent_at: '2026-10-24T00:00:00.000Z',
        events: [createValidLogEvent()],
      }),
    });
    assert.equal(res.statusCode, 401);
    const body = JSON.parse(res.payload);
    assert.equal(body.error.code, 'UNAUTHORIZED');
    assert.equal(body.error.retryable, false);
  });

  it('POST /ingest/v1/logs with invalid token returns 401 UNAUTHORIZED', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/ingest/v1/logs',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer sk_live_fake_token',
      },
      payload: JSON.stringify({
        protocol_version: '1.0',
        batch_id: crypto.randomUUID(),
        sent_at: '2026-10-24T00:00:00.000Z',
        events: [createValidLogEvent()],
      }),
    });
    assert.equal(res.statusCode, 401);
    const body = JSON.parse(res.payload);
    assert.equal(body.error.code, 'UNAUTHORIZED');
  });

  it('POST /ingest/v1/logs with revoked token returns 401 UNAUTHORIZED', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/ingest/v1/logs',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${revokedToken}`,
      },
      payload: JSON.stringify({
        protocol_version: '1.0',
        batch_id: crypto.randomUUID(),
        sent_at: '2026-10-24T00:00:00.000Z',
        events: [createValidLogEvent()],
      }),
    });
    assert.equal(res.statusCode, 401);
    const body = JSON.parse(res.payload);
    assert.equal(body.error.code, 'UNAUTHORIZED');
  });

  it('POST /ingest/v1/logs with expired token returns 401 UNAUTHORIZED', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/ingest/v1/logs',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${expiredToken}`,
      },
      payload: JSON.stringify({
        protocol_version: '1.0',
        batch_id: crypto.randomUUID(),
        sent_at: '2026-10-24T00:00:00.000Z',
        events: [createValidLogEvent()],
      }),
    });
    assert.equal(res.statusCode, 401);
    const body = JSON.parse(res.payload);
    assert.equal(body.error.code, 'UNAUTHORIZED');
  });

  it('POST /ingest/v1/logs with duplicate JSON keys in body returns 400 INVALID_JSON', async () => {
    const rawPayload = `{"protocol_version":"1.0","protocol_version":"1.0"}`;
    const res = await app.inject({
      method: 'POST',
      url: '/ingest/v1/logs',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${validToken}`,
      },
      payload: rawPayload,
    });
    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.payload);
    assert.equal(body.error.code, 'INVALID_JSON');
    assert.match(body.error.message, /Duplicate property/i);
  });

  it('POST /ingest/v1/logs with unsupported protocol version returns 400 UNSUPPORTED_PROTOCOL_VERSION', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/ingest/v1/logs',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${validToken}`,
      },
      payload: JSON.stringify({
        protocol_version: '2.0',
        sent_at: '2026-10-24T00:00:00.000Z',
        events: [createValidLogEvent()],
      }),
    });
    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.payload);
    assert.equal(body.error.code, 'UNSUPPORTED_PROTOCOL_VERSION');
  });

  it('POST /ingest/v1/logs with empty events array returns 422 BATCH_EMPTY', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/ingest/v1/logs',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${validToken}`,
      },
      payload: JSON.stringify({
        protocol_version: '1.0',
        sent_at: '2026-10-24T00:00:00.000Z',
        events: [],
      }),
    });
    assert.equal(res.statusCode, 422);
    const body = JSON.parse(res.payload);
    assert.equal(body.error.code, 'BATCH_EMPTY');
  });

  it('POST /ingest/v1/logs with invalid event schema returns 422 SCHEMA_VALIDATION_FAILED (atomic)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/ingest/v1/logs',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${validToken}`,
      },
      payload: JSON.stringify({
        protocol_version: '1.0',
        sent_at: '2026-10-24T00:00:00.000Z',
        events: [createValidLogEvent(), { invalid: 'event' }],
      }),
    });
    assert.equal(res.statusCode, 422);
    const body = JSON.parse(res.payload);
    assert.equal(body.error.code, 'SCHEMA_VALIDATION_FAILED');
  });

  it('POST /ingest/v1/logs with unauthorized project ID returns 403 PROJECT_ACCESS_DENIED', async () => {
    const unauthEvent = createValidLogEvent({ projectId: 'unauthorized-project' });
    const res = await app.inject({
      method: 'POST',
      url: '/ingest/v1/logs',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${validToken}`,
      },
      payload: JSON.stringify({
        protocol_version: '1.0',
        sent_at: '2026-10-24T00:00:00.000Z',
        events: [unauthEvent],
      }),
    });
    assert.equal(res.statusCode, 403);
    const body = JSON.parse(res.payload);
    assert.equal(body.error.code, 'PROJECT_ACCESS_DENIED');
  });

  it('POST /ingest/v1/logs with VALID AUTHORIZED BATCH returns 200 OK with durably_accepted receipt', async () => {
    const batchId = crypto.randomUUID();
    const event1 = createValidLogEvent();
    const event2 = createValidLogEvent();

    const res = await app.inject({
      method: 'POST',
      url: '/ingest/v1/logs',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${validToken}`,
      },
      payload: JSON.stringify({
        protocol_version: '1.0',
        batch_id: batchId,
        sent_at: '2026-10-24T00:00:00.000Z',
        events: [event1, event2],
      }),
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.status, 'durably_accepted');
    assert.equal(body.batch_id, batchId);
    assert.equal(body.accepted_count, 2);
    assert.equal(body.duplicate, false);
    assert.ok(body.receipt);
    assert.ok(body.receipt.receipt_id);
    assert.equal(body.receipt.journal_segment, 'active.wal');
    assert.equal(typeof body.receipt.journal_offset, 'number');
    assert.ok(body.receipt.committed_at);
    assert.match(body.receipt.content_digest, /^sha256:[a-f0-9]{64}$/);
  });

  it('POST /ingest/v1/logs retry of identical batch returns 200 OK with duplicate: true and same receipt', async () => {
    const batchId = crypto.randomUUID();
    const event = createValidLogEvent();
    const payload = JSON.stringify({
      protocol_version: '1.0',
      batch_id: batchId,
      sent_at: '2026-10-24T00:00:00.000Z',
      events: [event],
    });

    // 1. Initial submission
    const res1 = await app.inject({
      method: 'POST',
      url: '/ingest/v1/logs',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${validToken}`,
      },
      payload,
    });
    assert.equal(res1.statusCode, 200);
    const body1 = JSON.parse(res1.payload);
    assert.equal(body1.duplicate, false);

    // 2. Retry identical payload
    const res2 = await app.inject({
      method: 'POST',
      url: '/ingest/v1/logs',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${validToken}`,
      },
      payload,
    });
    assert.equal(res2.statusCode, 200);
    const body2 = JSON.parse(res2.payload);
    assert.equal(body2.status, 'durably_accepted');
    assert.equal(body2.duplicate, true);
    assert.equal(body2.batch_id, batchId);
    assert.equal(body2.receipt.receipt_id, body1.receipt.receipt_id);
    assert.equal(body2.receipt.content_digest, body1.receipt.content_digest);
    assert.equal(body2.receipt.journal_offset, body1.receipt.journal_offset);
  });

  it('POST /ingest/v1/logs with reused batch_id and modified events returns 409 IDEMPOTENCY_CONFLICT', async () => {
    const batchId = crypto.randomUUID();
    const event1 = createValidLogEvent({ overrides: { message: 'initial event' } });
    const payload1 = JSON.stringify({
      protocol_version: '1.0',
      batch_id: batchId,
      sent_at: '2026-10-24T00:00:00.000Z',
      events: [event1],
    });

    const res1 = await app.inject({
      method: 'POST',
      url: '/ingest/v1/logs',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${validToken}`,
      },
      payload: payload1,
    });
    assert.equal(res1.statusCode, 200);

    // Tampered payload reusing the same batchId
    const event2 = createValidLogEvent({ overrides: { message: 'tampered modified event' } });
    const payload2 = JSON.stringify({
      protocol_version: '1.0',
      batch_id: batchId,
      sent_at: '2026-10-24T00:00:00.000Z',
      events: [event2],
    });

    const res2 = await app.inject({
      method: 'POST',
      url: '/ingest/v1/logs',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${validToken}`,
      },
      payload: payload2,
    });

    assert.equal(res2.statusCode, 409);
    const body2 = JSON.parse(res2.payload);
    assert.equal(body2.error.code, 'IDEMPOTENCY_CONFLICT');
    assert.equal(body2.error.retryable, false);
  });

  it('POST /ingest/v1/logs with LEGACY SDK BATCH returns 200 OK durably_accepted', async () => {
    const event1 = createValidLogEvent();
    const event2 = createValidLogEvent();

    const res = await app.inject({
      method: 'POST',
      url: '/ingest/v1/logs',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${validToken}`,
      },
      payload: JSON.stringify({
        sent_at: '2026-10-24T00:00:00.000Z',
        batch_size: 2,
        events: [event1, event2],
      }),
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.status, 'durably_accepted');
    assert.equal(body.accepted_count, 2);
    assert.ok(body.batch_id);
    assert.ok(body.receipt);
  });

  it('GET /health/ready returns 503 and POST /ingest/v1/logs fails closed when WAL is closed', async () => {
    // Intentionally close WAL to simulate volume dismount or storage crash
    await walService.close();

    const readyRes = await app.inject({
      method: 'GET',
      url: '/health/ready',
    });
    assert.equal(readyRes.statusCode, 503);
    const readyBody = JSON.parse(readyRes.payload);
    assert.equal(readyBody.status, 'not_ready');
    assert.equal(readyBody.durability_backend, 'unavailable');

    const ingestRes = await app.inject({
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
        events: [createValidLogEvent()],
      }),
    });

    assert.equal(ingestRes.statusCode, 503);
    const ingestBody = JSON.parse(ingestRes.payload);
    assert.equal(ingestBody.error.code, 'STORAGE_NOT_READY');
    assert.equal(ingestBody.error.retryable, true);

    // Re-initialize for cleanup
    await walService.initialize();
  });
});
