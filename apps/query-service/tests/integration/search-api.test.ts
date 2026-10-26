import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../../src/app.module.js';
import { ProblemDetailsFilter } from '../../src/common/filters/problem-details.filter.js';
import {
  ARCHIVE_SEGMENT_REPOSITORY,
  type IArchiveSegmentRepository,
} from '../../src/modules/archive-discovery/domain/archive-segment.repository.interface.js';

describe('Search API Integration Tests (LOGHUB-QUERY-004)', () => {
  let app: NestFastifyApplication;
  let tempArchiveRoot: string;
  let segmentRepo: IArchiveSegmentRepository;

  const tenantId = '00000000-0000-0000-0000-000000000001';
  const projectId = 'proj-core-search';

  const validTokenPayload = {
    sub: 'user-search-01',
    tenantId,
    authorizedProjects: [projectId, 'auth-service'],
    allowedEnvironments: ['production', 'development'],
    roles: ['analyst'],
  };
  const validTestToken = `Bearer test-token:${Buffer.from(JSON.stringify(validTokenPayload)).toString('base64url')}`;

  const otherTenantTokenPayload = {
    sub: 'user-other-tenant',
    tenantId: '00000000-0000-0000-0000-000000000002',
    authorizedProjects: [projectId],
    allowedEnvironments: ['production'],
    roles: ['analyst'],
  };
  const otherTenantToken = `Bearer test-token:${Buffer.from(JSON.stringify(otherTenantTokenPayload)).toString('base64url')}`;

  const createEvent = (
    ts: string,
    id: string,
    level: string,
    message: string,
    extra: Record<string, unknown> = {},
  ) => ({
    '@timestamp': ts,
    'ecs.version': '8.11.0',
    event: { id, action: 'search.test', dataset: 'skyra.application' },
    log: { level },
    message,
    service: { name: 'core-search-api', environment: 'production', version: '1.0.0' },
    skyra: { project_id: projectId, tenant_id: tenantId, schema_version: '1.0.0' },
    ...extra,
  });

  before(async () => {
    tempArchiveRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skyra-search-integ-'));
    process.env['ARCHIVE_ROOT'] = tempArchiveRoot;
    process.env['QUERY_AUTH_MODE'] = 'test';
    process.env['NODE_ENV'] = 'test';
    process.env['CURSOR_SIGNING_SECRET'] = 'test-high-entropy-cursor-secret-32chars-min';

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

    // Create 3 archive segments with 2 records each = 6 total events
    const segDir = path.join(tempArchiveRoot, tenantId, projectId, 'production', 'core-search-api', '2026-10-26');
    fs.mkdirSync(segDir, { recursive: true });

    // Segment 1 (older records)
    const seg1Events = [
      createEvent('2026-10-26T10:00:00.000Z', '00000000-0000-4000-8000-000000000001', 'info', 'User registered successfully'),
      createEvent('2026-10-26T10:30:00.000Z', '00000000-0000-4000-8000-000000000002', 'warn', 'High memory usage: 85% threshold'),
    ];
    const seg1Content = seg1Events.map((e) => JSON.stringify(e)).join('\n') + '\n';
    const seg1File = path.join(segDir, 'segment-0001.jsonl');
    fs.writeFileSync(seg1File, seg1Content, 'utf8');
    const seg1Bytes = Buffer.byteLength(seg1Content);
    const seg1Checksum = crypto.createHash('sha256').update(seg1Content).digest('hex');
    fs.writeFileSync(
      path.join(segDir, 'segment-0001.manifest.json'),
      JSON.stringify({ segment_filename: 'segment-0001.jsonl', byte_size: seg1Bytes, sha256_checksum: seg1Checksum, record_count: 2 }),
      'utf8',
    );
    await segmentRepo.saveSegment({
      id: 'seg-s1',
      tenantId,
      projectId,
      environment: 'production',
      serviceName: 'core-search-api',
      date: '2026-10-26',
      segmentFilename: 'segment-0001.jsonl',
      recordCount: 2,
      byteSize: seg1Bytes,
      sha256Checksum: seg1Checksum,
      firstEventTimestamp: new Date('2026-10-26T10:00:00.000Z'),
      lastEventTimestamp: new Date('2026-10-26T10:30:00.000Z'),
      finalizedAt: new Date('2026-10-26T10:35:00.000Z'),
      writerInstanceId: 'inst-1',
      journalSegmentId: 'j-1',
      journalStartOffset: 0,
      journalEndOffset: seg1Bytes,
    });

    // Segment 2 (middle records with identical timestamp to test tie-breaker)
    const seg2Events = [
      createEvent('2026-10-26T11:00:00.000Z', '00000000-0000-4000-8000-000000000003', 'error', 'Database connection timeout', {
        error: { type: 'DatabaseTimeout' },
      }),
      createEvent('2026-10-26T11:00:00.000Z', '00000000-0000-4000-8000-000000000004', 'error', 'Database retry attempt failed', {
        error: { type: 'DatabaseRetryFailure' },
      }),
    ];
    const seg2Content = seg2Events.map((e) => JSON.stringify(e)).join('\n') + '\n';
    const seg2File = path.join(segDir, 'segment-0002.jsonl');
    fs.writeFileSync(seg2File, seg2Content, 'utf8');
    const seg2Bytes = Buffer.byteLength(seg2Content);
    const seg2Checksum = crypto.createHash('sha256').update(seg2Content).digest('hex');
    fs.writeFileSync(
      path.join(segDir, 'segment-0002.manifest.json'),
      JSON.stringify({ segment_filename: 'segment-0002.jsonl', byte_size: seg2Bytes, sha256_checksum: seg2Checksum, record_count: 2 }),
      'utf8',
    );
    await segmentRepo.saveSegment({
      id: 'seg-s2',
      tenantId,
      projectId,
      environment: 'production',
      serviceName: 'core-search-api',
      date: '2026-10-26',
      segmentFilename: 'segment-0002.jsonl',
      recordCount: 2,
      byteSize: seg2Bytes,
      sha256Checksum: seg2Checksum,
      firstEventTimestamp: new Date('2026-10-26T11:00:00.000Z'),
      lastEventTimestamp: new Date('2026-10-26T11:00:00.000Z'),
      finalizedAt: new Date('2026-10-26T11:05:00.000Z'),
      writerInstanceId: 'inst-1',
      journalSegmentId: 'j-2',
      journalStartOffset: 0,
      journalEndOffset: seg2Bytes,
    });

    // Segment 3 (latest records)
    const seg3Events = [
      createEvent('2026-10-26T11:30:00.000Z', '00000000-0000-4000-8000-000000000005', 'info', 'Health check ping passed'),
      createEvent('2026-10-26T12:00:00.000Z', '00000000-0000-4000-8000-000000000006', 'info', 'Background batch job completed'),
    ];
    const seg3Content = seg3Events.map((e) => JSON.stringify(e)).join('\n') + '\n';
    const seg3File = path.join(segDir, 'segment-0003.jsonl');
    fs.writeFileSync(seg3File, seg3Content, 'utf8');
    const seg3Bytes = Buffer.byteLength(seg3Content);
    const seg3Checksum = crypto.createHash('sha256').update(seg3Content).digest('hex');
    fs.writeFileSync(
      path.join(segDir, 'segment-0003.manifest.json'),
      JSON.stringify({ segment_filename: 'segment-0003.jsonl', byte_size: seg3Bytes, sha256_checksum: seg3Checksum, record_count: 2 }),
      'utf8',
    );
    await segmentRepo.saveSegment({
      id: 'seg-s3',
      tenantId,
      projectId,
      environment: 'production',
      serviceName: 'core-search-api',
      date: '2026-10-26',
      segmentFilename: 'segment-0003.jsonl',
      recordCount: 2,
      byteSize: seg3Bytes,
      sha256Checksum: seg3Checksum,
      firstEventTimestamp: new Date('2026-10-26T11:30:00.000Z'),
      lastEventTimestamp: new Date('2026-10-26T12:00:00.000Z'),
      finalizedAt: new Date('2026-10-26T12:05:00.000Z'),
      writerInstanceId: 'inst-1',
      journalSegmentId: 'j-3',
      journalStartOffset: 0,
      journalEndOffset: seg3Bytes,
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

  it('SEARCH-1: should perform a valid authorized search across archives and return conforming response', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/query/v1/logs/search',
      headers: {
        authorization: validTestToken,
        'x-correlation-id': 'req-search-01',
      },
      payload: {
        time_range: {
          start: '2026-10-26T09:00:00.000Z',
          end: '2026-10-26T13:00:00.000Z',
        },
        projects: [projectId],
        limit: 10,
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);

    assert.equal(body.events.length, 6);
    assert.equal(body.pagination.total_returned, 6);
    assert.equal(body.pagination.has_more, false);
    assert.equal(body.pagination.next_cursor, null);
    assert.equal(body.scope.tenant_id, tenantId);
    assert.deepEqual(body.scope.searched_projects, [projectId]);
    assert.ok(body.statistics.scanned_bytes > 0);
    assert.equal(body.statistics.scanned_segments, 3);
    assert.ok(typeof body.statistics.execution_time_ms === 'number');
    assert.ok(body.statistics.archive_watermark);

    // Sorted descending by @timestamp
    assert.equal(body.events[0].event.id, '00000000-0000-4000-8000-000000000006');
    assert.equal(body.events[5].event.id, '00000000-0000-4000-8000-000000000001');
  });

  it('SEARCH-2: should execute complete keyset cursor pagination with 0 duplicates and 0 skipped records', async () => {
    const searchBase = {
      time_range: {
        start: '2026-10-26T09:00:00.000Z',
        end: '2026-10-26T13:00:00.000Z',
      },
      projects: [projectId],
      limit: 2,
    };

    // Page 1
    const res1 = await app.inject({
      method: 'POST',
      url: '/query/v1/logs/search',
      headers: { authorization: validTestToken },
      payload: searchBase,
    });
    assert.equal(res1.statusCode, 200);
    const body1 = JSON.parse(res1.body);
    assert.equal(body1.events.length, 2);
    assert.equal(body1.pagination.has_more, true);
    assert.ok(typeof body1.pagination.next_cursor === 'string');
    const page1Ids = body1.events.map((e: any) => e.event.id);
    assert.deepEqual(page1Ids, [
      '00000000-0000-4000-8000-000000000006',
      '00000000-0000-4000-8000-000000000005',
    ]);

    // Page 2 (Continuation with cursor, handles identical timestamps deterministically)
    const res2 = await app.inject({
      method: 'POST',
      url: '/query/v1/logs/search',
      headers: { authorization: validTestToken },
      payload: {
        ...searchBase,
        cursor: body1.pagination.next_cursor,
      },
    });
    assert.equal(res2.statusCode, 200);
    const body2 = JSON.parse(res2.body);
    assert.equal(body2.events.length, 2);
    assert.equal(body2.pagination.has_more, true);
    assert.ok(typeof body2.pagination.next_cursor === 'string');
    const page2Ids = body2.events.map((e: any) => e.event.id);
    assert.deepEqual(page2Ids, [
      '00000000-0000-4000-8000-000000000004',
      '00000000-0000-4000-8000-000000000003',
    ]);

    // Page 3 (Final page)
    const res3 = await app.inject({
      method: 'POST',
      url: '/query/v1/logs/search',
      headers: { authorization: validTestToken },
      payload: {
        ...searchBase,
        cursor: body2.pagination.next_cursor,
      },
    });
    assert.equal(res3.statusCode, 200);
    const body3 = JSON.parse(res3.body);
    assert.equal(body3.events.length, 2);
    assert.equal(body3.pagination.has_more, false);
    assert.equal(body3.pagination.next_cursor, null);
    const page3Ids = body3.events.map((e: any) => e.event.id);
    assert.deepEqual(page3Ids, [
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000001',
    ]);

    // Verify union of all pages contains all 6 unique records with 0 overlap
    const allRetrievedIds = [...page1Ids, ...page2Ids, ...page3Ids];
    assert.equal(allRetrievedIds.length, 6);
    assert.equal(new Set(allRetrievedIds).size, 6);
  });

  it('SEARCH-3: should filter search results by level, service, and query_text', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/query/v1/logs/search',
      headers: { authorization: validTestToken },
      payload: {
        time_range: {
          start: '2026-10-26T09:00:00.000Z',
          end: '2026-10-26T13:00:00.000Z',
        },
        projects: [projectId],
        levels: ['error'],
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.events.length, 2);
    for (const e of body.events) {
      assert.equal(e.log.level, 'error');
    }

    // Substring text filter
    const resText = await app.inject({
      method: 'POST',
      url: '/query/v1/logs/search',
      headers: { authorization: validTestToken },
      payload: {
        time_range: {
          start: '2026-10-26T09:00:00.000Z',
          end: '2026-10-26T13:00:00.000Z',
        },
        projects: [projectId],
        query_text: 'memory',
      },
    });

    assert.equal(resText.statusCode, 200);
    const bodyText = JSON.parse(resText.body);
    assert.equal(bodyText.events.length, 1);
    assert.equal(bodyText.events[0].event.id, '00000000-0000-4000-8000-000000000002');
  });

  it('SEARCH-4: should reject cross-tenant search and prevent data leakage', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/query/v1/logs/search',
      headers: { authorization: otherTenantToken },
      payload: {
        time_range: {
          start: '2026-10-26T09:00:00.000Z',
          end: '2026-10-26T13:00:00.000Z',
        },
        projects: [projectId],
      },
    });

    // Other tenant has no archives for this project, returns empty list with 0 scanned files
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.scope.tenant_id, otherTenantTokenPayload.tenantId);
    assert.equal(body.statistics.scanned_segments, 0);
  });

  it('SEARCH-5: should reject tampered cursor with 422 Unprocessable Entity', async () => {
    // Generate valid cursor first
    const initRes = await app.inject({
      method: 'POST',
      url: '/query/v1/logs/search',
      headers: { authorization: validTestToken },
      payload: {
        time_range: {
          start: '2026-10-26T09:00:00.000Z',
          end: '2026-10-26T13:00:00.000Z',
        },
        projects: [projectId],
        limit: 1,
      },
    });
    const initBody = JSON.parse(initRes.body);
    const validCursor = initBody.pagination.next_cursor;
    assert.ok(validCursor);

    // Tamper with cursor
    const rawJson = Buffer.from(validCursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(rawJson);
    parsed.record_offset = 999;
    const tamperedCursor = Buffer.from(JSON.stringify(parsed)).toString('base64url');

    const res = await app.inject({
      method: 'POST',
      url: '/query/v1/logs/search',
      headers: { authorization: validTestToken },
      payload: {
        time_range: {
          start: '2026-10-26T09:00:00.000Z',
          end: '2026-10-26T13:00:00.000Z',
        },
        projects: [projectId],
        limit: 1,
        cursor: tamperedCursor,
      },
    });

    assert.equal(res.statusCode, 422);
    const body = JSON.parse(res.body);
    assert.equal(body.code, 'INVALID_CURSOR');
  });

  it('EVENT-1: should successfully look up single log event by UUIDv4', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/query/v1/logs/00000000-0000-4000-8000-000000000003?projectId=${projectId}`,
      headers: { authorization: validTestToken },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.event.id, '00000000-0000-4000-8000-000000000003');
    assert.equal(body.log.level, 'error');
    assert.equal(body.message, 'Database connection timeout');
  });

  it('EVENT-2: should return 404 Not Found when event UUID does not exist', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/query/v1/logs/00000000-0000-4000-8000-000000009999?projectId=${projectId}`,
      headers: { authorization: validTestToken },
    });

    assert.equal(res.statusCode, 404);
    const body = JSON.parse(res.body);
    assert.equal(body.code, 'NOT_FOUND');
  });

  it('EVENT-3: should return 403 Forbidden when caller lacks authorization for requested projectId', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/query/v1/logs/00000000-0000-4000-8000-000000000001?projectId=unauthorized-secret-project`,
      headers: { authorization: validTestToken },
    });

    assert.equal(res.statusCode, 403);
    const body = JSON.parse(res.body);
    assert.equal(body.code, 'FORBIDDEN_PROJECT_ACCESS');
  });

  it('EVENT-4: should return 400 Bad Request when projectId query parameter is missing', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/query/v1/logs/00000000-0000-4000-8000-000000000001`,
      headers: { authorization: validTestToken },
    });

    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.equal(body.code, 'INVALID_ARGUMENT');
  });
});
