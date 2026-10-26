import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../../src/app.module.js';
import { ProblemDetailsFilter } from '../../src/common/filters/problem-details.filter.js';
import { ARCHIVE_SEGMENT_REPOSITORY, type IArchiveSegmentRepository } from '../../src/modules/archive-discovery/domain/archive-segment.repository.interface.js';

describe('Query Service Real Fastify HTTP Integration Tests (LOGHUB-QUERY-002)', () => {
  let app: NestFastifyApplication;
  let tempArchiveRoot: string;
  let segmentRepo: IArchiveSegmentRepository;

  const tenantId = '00000000-0000-0000-0000-000000000001';
  const projectId = 'skyra-tech';

  // Valid test token base64 payload
  const validTokenPayload = {
    sub: 'user-integ-01',
    tenantId,
    authorizedProjects: [projectId, 'auth-service'],
    allowedEnvironments: ['production', 'development'],
    roles: ['analyst'],
  };
  const validTestToken = `Bearer test-token:${Buffer.from(JSON.stringify(validTokenPayload)).toString('base64url')}`;

  // Token restricted to only 'auth-service'
  const restrictedTokenPayload = {
    sub: 'user-integ-restricted',
    tenantId,
    authorizedProjects: ['auth-service'],
    allowedEnvironments: ['production'],
    roles: ['viewer'],
  };
  const restrictedTestToken = `Bearer test-token:${Buffer.from(JSON.stringify(restrictedTokenPayload)).toString('base64url')}`;

  before(async () => {
    try {
      tempArchiveRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skyra-query-integ-'));
      process.env['ARCHIVE_ROOT'] = tempArchiveRoot;
      process.env['QUERY_AUTH_MODE'] = 'test';
      process.env['NODE_ENV'] = 'test';

      const adapter = new FastifyAdapter({
        bodyLimit: 2 * 1024 * 1024,
        logger: false,
      });

      app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
        logger: false,
        abortOnError: false,
      });

      app.useGlobalFilters(new ProblemDetailsFilter());
      await app.init();
      await app.getHttpAdapter().getInstance().ready();

      segmentRepo = app.get<IArchiveSegmentRepository>(ARCHIVE_SEGMENT_REPOSITORY);
    } catch (err) {
      console.error('BEFORE HOOK ERROR:', err);
      throw err;
    }

    // Seed test segment
    const segmentDir = path.join(tempArchiveRoot, tenantId, projectId, 'production', 'api-gateway', '2026-10-25');
    fs.mkdirSync(segmentDir, { recursive: true });
    const segmentFile = path.join(segmentDir, 'segment_0001.jsonl');
    fs.writeFileSync(segmentFile, '{"msg":"hello world"}\n', 'utf8');

    await segmentRepo.saveSegment({
      id: 'seg-test-01',
      tenantId,
      projectId,
      environment: 'production',
      serviceName: 'api-gateway',
      date: '2026-10-25',
      segmentFilename: 'segment_0001.jsonl',
      recordCount: 1,
      byteSize: 22,
      sha256Checksum: 'dummychecksum',
      firstEventTimestamp: new Date('2026-10-25T10:00:00Z'),
      lastEventTimestamp: new Date('2026-10-25T10:01:00Z'),
      finalizedAt: new Date('2026-10-25T10:05:00Z'),
      writerInstanceId: 'writer-01',
      journalSegmentId: 'journal-01',
      journalStartOffset: 0,
      journalEndOffset: 22,
    });
  });

  after(async () => {
    if (app) {
      await app.close();
    }
    try {
      fs.rmSync(tempArchiveRoot, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('GET /health/live should return 200 OK', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health/live',
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.status, 'ok');
    assert.equal(body.service, 'skyra-query-service');
    assert.ok(typeof body.uptimeSeconds === 'number');
  });

  it('GET /health/ready should return health status', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health/ready',
    });

    assert.ok(res.statusCode === 200 || res.statusCode === 503);
    const body = JSON.parse(res.body);
    assert.ok(body.service === 'skyra-query-service');
    assert.ok(body.checks);
  });

  it('POST /query/v1/archive/discover should return 401 when Authorization header is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/query/v1/archive/discover',
      payload: {},
    });

    assert.equal(res.statusCode, 401);
    const body = JSON.parse(res.body);
    assert.equal(body.code, 'UNAUTHORIZED');
  });

  it('POST /query/v1/archive/discover should return 403 when requesting project outside authorized scope', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/query/v1/archive/discover',
      headers: {
        authorization: restrictedTestToken,
      },
      payload: {
        projects: ['forbidden-payroll-project'],
      },
    });

    assert.equal(res.statusCode, 403);
    const body = JSON.parse(res.body);
    assert.equal(body.code, 'FORBIDDEN_PROJECT_ACCESS');
  });

  it('POST /query/v1/archive/discover should return 200 with discovered segments for authorized principal', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/query/v1/archive/discover',
      headers: {
        authorization: validTestToken,
      },
      payload: {
        projects: [projectId],
        startDate: '2026-10-01',
        endDate: '2026-10-31',
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.meta.tenant_id, tenantId);
    assert.ok(Array.isArray(body.segments));
    assert.equal(body.meta.total_discovered, 1);
    assert.equal(body.segments[0].id, 'seg-test-01');
    assert.equal(body.segments[0].project_id, projectId);
    // Crucial security verification: raw physical paths MUST NOT be leaked in public API response
    assert.equal(body.segments[0].resolvedPath, undefined);
  });

  it('GET /query/v1/logs/search should return 501 Not Implemented (RFC 7807)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/query/v1/logs/search',
      headers: {
        authorization: validTestToken,
      },
    });

    assert.equal(res.statusCode, 501);
    const body = JSON.parse(res.body);
    assert.equal(body.status, 501);
    assert.equal(body.code, 'NOT_IMPLEMENTED');
  });

  it('GET /query/v1/logs/:eventId should return 400 Bad Request on invalid UUID', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/query/v1/logs/evt-12345',
      headers: {
        authorization: validTestToken,
      },
    });

    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.equal(body.status, 400);
    assert.equal(body.code, 'INVALID_ARGUMENT');
  });

  it('GET /query/v1/logs/aggregate should return 501 Not Implemented', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/query/v1/logs/aggregate',
      headers: {
        authorization: validTestToken,
      },
    });

    assert.equal(res.statusCode, 501);
    const body = JSON.parse(res.body);
    assert.equal(body.code, 'NOT_IMPLEMENTED');
  });

  it('GET /query/v1/logs/facets should return 501 Not Implemented', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/query/v1/logs/facets',
      headers: {
        authorization: validTestToken,
      },
    });

    assert.equal(res.statusCode, 501);
    const body = JSON.parse(res.body);
    assert.equal(body.code, 'NOT_IMPLEMENTED');
  });

  it('POST /query/v1/logs/search should reject malformed payload with 400 Bad Request', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/query/v1/logs/search',
      headers: {
        authorization: validTestToken,
      },
      payload: {
        query: { match_all: {} },
      },
    });

    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.equal(body.code, 'INVALID_ARGUMENT');
  });

  it('POST /query/v1/logs/aggregate should return 501 Not Implemented (OpenAPI POST contract)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/query/v1/logs/aggregate',
      headers: {
        authorization: validTestToken,
      },
      payload: {},
    });

    assert.equal(res.statusCode, 501);
    const body = JSON.parse(res.body);
    assert.equal(body.code, 'NOT_IMPLEMENTED');
  });

  it('POST /query/v1/logs/facets should return 501 Not Implemented (OpenAPI POST contract)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/query/v1/logs/facets',
      headers: {
        authorization: validTestToken,
      },
      payload: {},
    });

    assert.equal(res.statusCode, 501);
    const body = JSON.parse(res.body);
    assert.equal(body.code, 'NOT_IMPLEMENTED');
  });

  it('POST /query/v1/archive/discover should reject invalid request with RFC 7807 400 Bad Request', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/query/v1/archive/discover',
      headers: {
        authorization: validTestToken,
      },
      payload: {
        unknown_malicious_field: 'attack',
        start_date: 'not-a-date',
      },
    });

    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.equal(body.status, 400);
    assert.equal(body.code, 'INVALID_ARGUMENT');
    assert.ok(Array.isArray(body.invalid_params));
    assert.ok(body.invalid_params.some((p: { name: string }) => p.name === 'unknown_malicious_field'));
    assert.ok(body.invalid_params.some((p: { name: string }) => p.name === 'start_date'));
  });

  it('Correlation ID must be propagated in response headers', async () => {
    const customCorrelationId = 'corr-custom-xyz-123';
    const res = await app.inject({
      method: 'GET',
      url: '/health/live',
      headers: {
        'x-correlation-id': customCorrelationId,
      },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['x-correlation-id'], customCorrelationId);
  });
});
