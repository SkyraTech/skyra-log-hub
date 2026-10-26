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

describe('Analytics & Facets HTTP Integration Tests (LOGHUB-QUERY-005)', () => {
  let app: NestFastifyApplication;
  let tempArchiveRoot: string;
  let segmentRepo: IArchiveSegmentRepository;

  const tenantId = '00000000-0000-0000-0000-000000000001';
  const otherTenantId = '00000000-0000-0000-0000-000000000002';
  const projectAlpha = 'proj-alpha';
  const projectBeta = 'proj-beta';
  const secretProject = 'proj-secret';

  // Helper to create test JWT tokens
  const createToken = (tenant: string, projects: string[], user = 'test-analyst') => {
    const payload = {
      sub: user,
      tenantId: tenant,
      authorizedProjects: projects,
      allowedEnvironments: ['production', 'staging'],
      roles: ['analyst'],
    };
    return `Bearer test-token:${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
  };

  const validToken = createToken(tenantId, [projectAlpha, projectBeta]);
  const restrictedToken = createToken(tenantId, [projectAlpha]); // Only alpha
  const otherTenantToken = createToken(otherTenantId, [projectAlpha]);

  before(async () => {
    tempArchiveRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skyra-analytics-test-'));
    process.env['ARCHIVE_ROOT'] = tempArchiveRoot;
    process.env['QUERY_AUTH_MODE'] = 'test';
    process.env['NODE_ENV'] = 'test';

    const adapter = new FastifyAdapter({ logger: false });
    app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
      logger: false,
      abortOnError: false,
    });

    app.useGlobalFilters(new ProblemDetailsFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    segmentRepo = app.get<IArchiveSegmentRepository>(ARCHIVE_SEGMENT_REPOSITORY);

    // Seed realistic canonical JSONL log segments across 2 projects
    const alphaDir = path.join(tempArchiveRoot, tenantId, projectAlpha, 'production', 'auth-service', '2026-10-26');
    const betaDir = path.join(tempArchiveRoot, tenantId, projectBeta, 'production', 'payment-service', '2026-10-26');
    const otherTenantDir = path.join(tempArchiveRoot, otherTenantId, projectAlpha, 'production', 'auth-service', '2026-10-26');

    fs.mkdirSync(alphaDir, { recursive: true });
    fs.mkdirSync(betaDir, { recursive: true });
    fs.mkdirSync(otherTenantDir, { recursive: true });

    // Events for Project Alpha (auth-service)
    const alphaEvents = [
      {
        '@timestamp': '2026-10-26T01:10:00.123Z',
        'ecs.version': '8.11.0',
        event: { id: 'a0000000-0000-4000-8000-000000000001', action: 'user.login' },
        log: { level: 'info' },
        message: 'User logged in',
        service: { name: 'auth-service', environment: 'production' },
        skyra: { project_id: projectAlpha, tenant_id: tenantId, schema_version: '1.0.0' },
      },
      {
        '@timestamp': '2026-10-26T01:25:00.456Z',
        'ecs.version': '8.11.0',
        event: { id: 'a0000000-0000-4000-8000-000000000002', action: 'user.login' },
        log: { level: 'info' },
        message: 'Second login',
        service: { name: 'auth-service', environment: 'production' },
        skyra: { project_id: projectAlpha, tenant_id: tenantId, schema_version: '1.0.0' },
      },
      {
        '@timestamp': '2026-10-26T02:05:00.789Z',
        'ecs.version': '8.11.0',
        event: { id: 'a0000000-0000-4000-8000-000000000003', action: 'user.login' },
        log: { level: 'error' },
        error: { type: 'InvalidCredentialsException', message: 'Auth failed' },
        message: 'Password mismatch for user \u2764\ufe0f Unicode User',
        service: { name: 'auth-service', environment: 'production' },
        skyra: { project_id: projectAlpha, tenant_id: tenantId, schema_version: '1.0.0' },
      },
    ];

    // Events for Project Beta (payment-service)
    const betaEvents = [
      {
        '@timestamp': '2026-10-26T01:40:00.000Z',
        'ecs.version': '8.11.0',
        event: { id: 'b0000000-0000-4000-8000-000000000001', action: 'payment.charge' },
        log: { level: 'info' },
        message: 'Charge successful',
        service: { name: 'payment-service', environment: 'production' },
        skyra: { project_id: projectBeta, tenant_id: tenantId, schema_version: '1.0.0' },
      },
      {
        '@timestamp': '2026-10-26T02:15:00.000Z',
        'ecs.version': '8.11.0',
        event: { id: 'b0000000-0000-4000-8000-000000000002', action: 'payment.charge' },
        log: { level: 'error' },
        error: { type: 'PaymentGatewayTimeout', message: 'Timeout contacting bank' },
        message: 'Charge failed: gateway timeout',
        service: { name: 'payment-service', environment: 'production' },
        skyra: { project_id: projectBeta, tenant_id: tenantId, schema_version: '1.0.0' },
      },
    ];

    // Events for Other Tenant (same service name, must NEVER leak!)
    const otherTenantEvents = [
      {
        '@timestamp': '2026-10-26T01:10:00.000Z',
        'ecs.version': '8.11.0',
        event: { id: 'x0000000-0000-4000-8000-000000000001', action: 'user.login' },
        log: { level: 'fatal' },
        message: 'Confidential other tenant event',
        service: { name: 'auth-service', environment: 'production' },
        skyra: { project_id: projectAlpha, tenant_id: otherTenantId, schema_version: '1.0.0' },
      },
    ];

    const writeSegment = async (dir: string, filename: string, events: object[], tenant: string, proj: string, sName: string) => {
      const filePath = path.join(dir, filename);
      const content = events.map((e) => JSON.stringify(e)).join('\n') + '\n';
      fs.writeFileSync(filePath, content, 'utf8');
      const stat = fs.statSync(filePath);
      const hash = crypto.createHash('sha256').update(content).digest('hex');

      await segmentRepo.saveSegment({
        id: `seg-${tenant.slice(0, 4)}-${proj}-${filename}`,
        tenantId: tenant,
        projectId: proj,
        environment: 'production',
        serviceName: sName,
        date: '2026-10-26',
        segmentFilename: filename,
        recordCount: events.length,
        byteSize: stat.size,
        sha256Checksum: hash,
        firstEventTimestamp: new Date('2026-10-26T01:00:00Z'),
        lastEventTimestamp: new Date('2026-10-26T03:00:00Z'),
        finalizedAt: new Date('2026-10-26T03:05:00Z'),
        writerInstanceId: 'writer-01',
        journalSegmentId: 'j-01',
        journalStartOffset: 0,
        journalEndOffset: stat.size,
      });
    };

    await writeSegment(alphaDir, 'segment-0000.jsonl', alphaEvents, tenantId, projectAlpha, 'auth-service');
    await writeSegment(betaDir, 'segment-0000.jsonl', betaEvents, tenantId, projectBeta, 'payment-service');
    await writeSegment(otherTenantDir, 'segment-0000.jsonl', otherTenantEvents, otherTenantId, projectAlpha, 'auth-service');
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

  // ==========================================
  // AGGREGATION API (POST /query/v1/logs/aggregate)
  // ==========================================

  it('AGG-1: Total count & Terms aggregation across authorized projects', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/query/v1/logs/aggregate',
      headers: { authorization: validToken },
      payload: {
        time_range: {
          start: '2026-10-26T00:00:00.000Z',
          end: '2026-10-26T12:00:00.000Z',
        },
        aggregations: [
          {
            name: 'by_severity',
            type: 'terms',
            field: 'log.level',
            size: 10,
          },
          {
            name: 'by_service',
            type: 'terms',
            field: 'service.name',
            size: 10,
          },
        ],
      },
    });

    if (res.statusCode !== 200) {
      console.error('AGG-1 ERROR BODY:', res.body);
    }
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);

    assert.ok(body.aggregations.by_severity);
    assert.equal(body.aggregations.by_severity.type, 'terms');

    // Expected: 3 info events, 2 error events across Alpha and Beta (Total: 5)
    // Other tenant has 1 fatal event which must NOT appear!
    const severityBuckets = body.aggregations.by_severity.buckets;
    const infoBucket = severityBuckets.find((b: { key: string }) => b.key === 'info');
    const errorBucket = severityBuckets.find((b: { key: string }) => b.key === 'error');
    const fatalBucket = severityBuckets.find((b: { key: string }) => b.key === 'fatal');

    assert.equal(infoBucket.count, 3);
    assert.equal(errorBucket.count, 2);
    assert.equal(fatalBucket, undefined); // Cross-tenant isolation verified!

    // By service: auth-service (3), payment-service (2)
    const serviceBuckets = body.aggregations.by_service.buckets;
    assert.equal(serviceBuckets[0].key, 'auth-service');
    assert.equal(serviceBuckets[0].count, 3);
    assert.equal(serviceBuckets[1].key, 'payment-service');
    assert.equal(serviceBuckets[1].count, 2);
  });

  it('AGG-2: Time-series date histogram with exact UTC bucket alignment', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/query/v1/logs/aggregate',
      headers: { authorization: validToken },
      payload: {
        time_range: {
          start: '2026-10-26T00:00:00.000Z',
          end: '2026-10-26T12:00:00.000Z',
        },
        aggregations: [
          {
            name: 'hourly_timeline',
            type: 'date_histogram',
            field: '@timestamp',
            interval: '1h',
          },
        ],
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);

    const timeline = body.aggregations.hourly_timeline;
    assert.equal(timeline.type, 'date_histogram');

    // Hourly buckets:
    // 01:00:00Z -> 3 events (01:10, 01:25, 01:40)
    // 02:00:00Z -> 2 events (02:05, 02:15)
    const b01 = timeline.buckets.find((b: { timestamp: string }) => b.timestamp.includes('01:00:00'));
    const b02 = timeline.buckets.find((b: { timestamp: string }) => b.timestamp.includes('02:00:00'));

    assert.ok(b01, 'Bucket for 01:00:00 UTC must exist');
    assert.equal(b01.count, 3);
    assert.ok(b02, 'Bucket for 02:00:00 UTC must exist');
    assert.equal(b02.count, 2);
  });

  it('AGG-3: Cardinality aggregation for distinct values', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/query/v1/logs/aggregate',
      headers: { authorization: validToken },
      payload: {
        time_range: {
          start: '2026-10-26T00:00:00.000Z',
          end: '2026-10-26T12:00:00.000Z',
        },
        aggregations: [
          {
            name: 'distinct_actions',
            type: 'cardinality',
            field: 'event.action',
          },
        ],
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    const card = body.aggregations.distinct_actions;
    assert.equal(card.type, 'cardinality');
    // Distinct actions: user.login and payment.charge (2)
    assert.equal(card.value, 2);
  });

  it('AGG-4: Filtered aggregation: severity distribution within specific service', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/query/v1/logs/aggregate',
      headers: { authorization: validToken },
      payload: {
        time_range: {
          start: '2026-10-26T00:00:00.000Z',
          end: '2026-10-26T12:00:00.000Z',
        },
        services: ['payment-service'],
        aggregations: [
          {
            name: 'payment_severities',
            type: 'terms',
            field: 'log.level',
            size: 5,
          },
        ],
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    const buckets = body.aggregations.payment_severities.buckets;
    // Payment service has 1 info and 1 error
    assert.equal(buckets.length, 2);
    assert.equal(buckets.find((b: { key: string }) => b.key === 'info')?.count, 1);
    assert.equal(buckets.find((b: { key: string }) => b.key === 'error')?.count, 1);
  });

  it('AGG-5: Restricted project scope: principal with proj-alpha access cannot see proj-beta logs', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/query/v1/logs/aggregate',
      headers: { authorization: restrictedToken }, // Only proj-alpha
      payload: {
        time_range: {
          start: '2026-10-26T00:00:00.000Z',
          end: '2026-10-26T12:00:00.000Z',
        },
        aggregations: [
          {
            name: 'services',
            type: 'terms',
            field: 'service.name',
          },
        ],
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    const buckets = body.aggregations.services.buckets;
    // Only auth-service should appear
    assert.equal(buckets.length, 1);
    assert.equal(buckets[0].key, 'auth-service');
    assert.equal(buckets[0].count, 3);
  });

  it('AGG-6: Empty archive time range yields empty buckets gracefully', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/query/v1/logs/aggregate',
      headers: { authorization: validToken },
      payload: {
        time_range: {
          start: '2026-01-01T00:00:00.000Z',
          end: '2026-01-02T00:00:00.000Z',
        },
        aggregations: [
          {
            name: 'empty_timeline',
            type: 'date_histogram',
            field: '@timestamp',
            interval: '1h',
          },
        ],
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.deepEqual(body.aggregations.empty_timeline.buckets, []);
    assert.equal(body.statistics.scanned_segments, 0);
  });

  // ==========================================
  // FACETS API (POST /query/v1/logs/facets)
  // ==========================================

  it('FAC-1: Dynamic facet discovery across allowed facet fields', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/query/v1/logs/facets',
      headers: { authorization: validToken },
      payload: {
        time_range: {
          start: '2026-10-26T00:00:00.000Z',
          end: '2026-10-26T12:00:00.000Z',
        },
        facet_fields: ['service.name', 'log.level', 'event.action', 'error.type'],
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);

    assert.ok(body.facets['service.name']);
    assert.ok(body.facets['log.level']);
    assert.ok(body.facets['event.action']);
    assert.ok(body.facets['error.type']);

    // Check service names
    const serviceFacets = body.facets['service.name'];
    assert.equal(serviceFacets[0].value, 'auth-service');
    assert.equal(serviceFacets[0].count, 3);
    assert.equal(serviceFacets[1].value, 'payment-service');
    assert.equal(serviceFacets[1].count, 2);

    // Check error types
    const errorFacets = body.facets['error.type'];
    const invalidCreds = errorFacets.find((f: { value: string }) => f.value === 'InvalidCredentialsException');
    const gatewayTimeout = errorFacets.find((f: { value: string }) => f.value === 'PaymentGatewayTimeout');
    assert.ok(invalidCreds);
    assert.ok(gatewayTimeout);
  });

  it('FAC-2: Facet discovery respects project filtering', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/query/v1/logs/facets',
      headers: { authorization: validToken },
      payload: {
        time_range: {
          start: '2026-10-26T00:00:00.000Z',
          end: '2026-10-26T12:00:00.000Z',
        },
        projects: [projectBeta],
        facet_fields: ['service.name'],
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    const services = body.facets['service.name'];
    assert.equal(services.length, 1);
    assert.equal(services[0].value, 'payment-service');
  });

  // ==========================================
  // SECURITY & GOVERNANCE TESTS
  // ==========================================

  it('SEC-1: Rejects unauthenticated request with 401 Unauthorized', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/query/v1/logs/aggregate',
      payload: {
        time_range: {
          start: '2026-10-26T00:00:00.000Z',
          end: '2026-10-26T12:00:00.000Z',
        },
        aggregations: [{ name: 'test', type: 'terms', field: 'service.name' }],
      },
    });

    assert.equal(res.statusCode, 401);
  });

  it('SEC-2: Rejects unauthorized project request with 403 Forbidden', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/query/v1/logs/aggregate',
      headers: { authorization: restrictedToken }, // Only proj-alpha allowed
      payload: {
        time_range: {
          start: '2026-10-26T00:00:00.000Z',
          end: '2026-10-26T12:00:00.000Z',
        },
        projects: [secretProject], // Not granted!
        aggregations: [{ name: 'test', type: 'terms', field: 'service.name' }],
      },
    });

    assert.equal(res.statusCode, 403);
    const body = JSON.parse(res.body);
    assert.equal(body.code, 'FORBIDDEN_PROJECT_ACCESS');
  });

  it('SEC-3: GET /query/v1/logs/aggregate returns 405 Method Not Allowed', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/query/v1/logs/aggregate',
      headers: { authorization: validToken },
    });

    assert.equal(res.statusCode, 405);
  });

  it('SEC-4: GET /query/v1/logs/facets returns 405 Method Not Allowed', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/query/v1/logs/facets',
      headers: { authorization: validToken },
    });

    assert.equal(res.statusCode, 405);
  });

  it('SEC-5: Reject unallowlisted group-by field with 422 Problem Details', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/query/v1/logs/aggregate',
      headers: { authorization: validToken },
      payload: {
        time_range: {
          start: '2026-10-26T00:00:00.000Z',
          end: '2026-10-26T12:00:00.000Z',
        },
        aggregations: [
          {
            name: 'malicious',
            type: 'terms',
            field: 'credit_card.cvv',
          },
        ],
      },
    });

    assert.equal(res.statusCode, 422);
    const body = JSON.parse(res.body);
    assert.equal(body.code, 'UNSUPPORTED_FILTER_FIELD');
  });

  it('SEC-6: Rejects time bucket budget overflow with 400 Bad Request', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/query/v1/logs/aggregate',
      headers: { authorization: validToken },
      payload: {
        time_range: {
          start: '2026-10-01T00:00:00.000Z',
          end: '2026-10-20T00:00:00.000Z',
        },
        aggregations: [
          {
            name: 'too_many_buckets',
            type: 'date_histogram',
            field: '@timestamp',
            interval: '1m', // 19 days * 1440 min = >27,000 buckets > 2000 limit
          },
        ],
      },
    });

    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.ok(body.detail.includes('exceeds maximum limit of 2000 buckets'));
  });
});
