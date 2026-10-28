import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as http from 'node:http';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyCookie from '@fastify/cookie';
import { AppModule } from '../../src/app.module.js';
import { ProblemDetailsFilter } from '../../src/common/filters/problem-details.filter.js';
import { BffConfigService } from '../../src/config/bff-config.service.js';

describe('BFF Query Proxy Integration Test Suite (CONSOLE-004)', () => {
  let app: NestFastifyApplication;
  let mockQueryServer: http.Server;
  let mockQueryPort: number;
  let lastUpstreamRequest: {
    method?: string;
    url?: string;
    headers?: http.IncomingHttpHeaders;
    body?: any;
  } = {};

  let sessionCookie: string;
  let csrfToken: string;

  before(async () => {
    // 1. Spin up an isolated mock Query Service on a dynamic ephemeral port
    mockQueryServer = http.createServer((req, res) => {
      let data = '';
      req.on('data', (chunk) => {
        data += chunk;
      });
      req.on('end', () => {
        lastUpstreamRequest = {
          method: req.method,
          url: req.url,
          headers: req.headers,
          body: data ? JSON.parse(data) : undefined,
        };

        if (req.url?.includes('/query/v1/logs/search')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              events: [
                {
                  '@timestamp': '2026-10-28T05:00:00.000Z',
                  ecs: { version: '8.11.0' },
                  event: { id: '00000000-0000-4000-8000-000000000001', action: 'auth_login' },
                  log: { level: 'info' },
                  message: 'User authentication succeeded',
                  service: { name: 'auth-service', environment: 'production' },
                  skyra: { tenant_id: 'skyra-internal', project_id: 'auth-service', schema_version: '1.0.0' },
                },
              ],
              pagination: {
                has_more: false,
                next_cursor: null,
                total_returned: 1,
              },
              statistics: {
                scanned_bytes: 524288,
                scanned_segments: 2,
                execution_time_ms: 8.5,
                archive_watermark: '2026-10-28T04:59:00.000Z',
              },
              scope: {
                tenant_id: 'skyra-internal',
                searched_projects: ['auth-service'],
              },
            }),
          );
        } else if (req.url?.includes('/query/v1/logs/aggregate')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              aggregations: {
                volume_over_time: {
                  type: 'date_histogram',
                  buckets: [
                    { timestamp: '2026-10-28T04:00:00.000Z', count: 12 },
                  ],
                },
                severity_distribution: {
                  type: 'terms',
                  buckets: [
                    { key: 'info', count: 12 },
                  ],
                },
              },
              statistics: {
                scanned_bytes: 262144,
                scanned_segments: 1,
                execution_time_ms: 4.5,
                archive_watermark: '2026-10-28T04:59:00.000Z',
              },
              scope: {
                tenant_id: 'skyra-internal',
                searched_projects: ['auth-service'],
              },
            }),
          );
        } else if (req.url?.includes('/query/v1/logs/facets')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              facets: {
                'service.name': [{ value: 'auth-service', count: 12 }],
                'log.level': [{ value: 'info', count: 12 }],
              },
              statistics: {
                scanned_bytes: 262144,
                scanned_segments: 1,
                execution_time_ms: 3.2,
                archive_watermark: '2026-10-28T04:59:00.000Z',
              },
              scope: {
                tenant_id: 'skyra-internal',
                searched_projects: ['auth-service'],
              },
            }),
          );
        } else if (req.url?.includes('/query/v1/logs/00000000-0000-4000-8000-000000000001')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              '@timestamp': '2026-10-28T05:00:00.000Z',
              ecs: { version: '8.11.0' },
              event: { id: '00000000-0000-4000-8000-000000000001' },
              log: { level: 'info' },
              message: 'Single event lookup payload',
              service: { name: 'auth-service', environment: 'production' },
              skyra: { tenant_id: 'skyra-internal', project_id: 'auth-service', schema_version: '1.0.0' },
            }),
          );
        } else {
          res.writeHead(404, { 'Content-Type': 'application/problem+json' });
          res.end(JSON.stringify({ title: 'Not Found', status: 404, detail: 'Resource not found' }));
        }
      });
    });

    await new Promise<void>((resolve) => {
      mockQueryServer.listen(0, '127.0.0.1', () => {
        const addr = mockQueryServer.address() as any;
        mockQueryPort = addr.port;
        resolve();
      });
    });

    // 2. Configure BFF to route to our test Query Service
    process.env['QUERY_SERVICE_URL'] = `http://127.0.0.1:${mockQueryPort}`;

    app = await NestFactory.create<NestFastifyApplication>(
      AppModule,
      new FastifyAdapter({ logger: false }),
    );
    await app.register(fastifyCookie as any, {
      secret: 'test-session-secret-at-least-32-chars-long!',
    });
    app.useGlobalFilters(new ProblemDetailsFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    // 3. Establish authenticated session
    const loginRes = await app.inject({
      method: 'GET',
      url: '/bff/auth/login?redirect=false&returnUrl=/logs',
    });
    const { state } = JSON.parse(loginRes.body);

    const callbackRes = await app.inject({
      method: 'GET',
      url: `/bff/auth/callback?code=mock:usr_lead:architect@skyra.dev:Principal%20Architect&state=${state}`,
    });

    const setCookies = callbackRes.headers['set-cookie'];
    const cookies = (Array.isArray(setCookies) ? setCookies : [setCookies]).filter((c): c is string => typeof c === 'string');
    const sessionCookieStr = cookies.find((c) => c.includes('session='));
    assert.ok(sessionCookieStr);
    sessionCookie = sessionCookieStr.split(';')[0]!;

    const sessionRes = await app.inject({
      method: 'GET',
      url: '/bff/session',
      headers: { cookie: sessionCookie },
    });
    const sessionData = JSON.parse(sessionRes.body);
    csrfToken = sessionData.csrfToken;
  });

  after(async () => {
    if (app) await app.close();
    if (mockQueryServer) {
      await new Promise<void>((resolve) => mockQueryServer.close(() => resolve()));
    }
  });

  it('1. POST /bff/query/search forwards authorized request to Query Service with short-lived JWT', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/bff/query/search',
      headers: {
        cookie: sessionCookie,
        origin: 'http://localhost:4200',
        'x-csrf-token': csrfToken,
        'x-correlation-id': 'corr-search-1234',
        'content-type': 'application/json',
      },
      payload: {
        tenantId: 'skyra-internal',
        projectId: 'auth-service',
        time_range: {
          start: '2026-10-28T04:00:00Z',
          end: '2026-10-28T05:00:00Z',
        },
        limit: 50,
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.events.length, 1);
    assert.equal(body.events[0].service.name, 'auth-service');

    // Verify upstream request properties
    assert.equal(lastUpstreamRequest.method, 'POST');
    assert.ok(lastUpstreamRequest.url?.includes('/query/v1/logs/search'));
    assert.equal(lastUpstreamRequest.headers?.['x-correlation-id'], 'corr-search-1234');

    // Verify JWT was injected
    const authHeader = lastUpstreamRequest.headers?.['authorization'];
    assert.ok(authHeader?.startsWith('Bearer '));

    // Verify tenantId & projectId were cleaned from forwarded body
    assert.equal(lastUpstreamRequest.body.tenantId, undefined);
    assert.equal(lastUpstreamRequest.body.projectId, undefined);
    assert.deepEqual(lastUpstreamRequest.body.projects, ['auth-service']);
  });

  it('2. POST /bff/query/search rejects unauthorized foreign project with 403 Forbidden', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/bff/query/search',
      headers: {
        cookie: sessionCookie,
        origin: 'http://localhost:4200',
        'x-csrf-token': csrfToken,
        'content-type': 'application/json',
      },
      payload: {
        tenantId: 'skyra-internal',
        projectId: 'unauthorized-project-x',
        time_range: {
          start: '2026-10-28T04:00:00Z',
          end: '2026-10-28T05:00:00Z',
        },
      },
    });

    assert.equal(res.statusCode, 403);
    const body = JSON.parse(res.body);
    assert.equal(body.code, 'UNAUTHORIZED_PROJECT_ACCESS');
    assert.ok(body.detail.includes('unauthorized-project-x'));
  });

  it('3. POST /bff/query/search rejects cross-tenant project with 403 Forbidden', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/bff/query/search',
      headers: {
        cookie: sessionCookie,
        origin: 'http://localhost:4200',
        'x-csrf-token': csrfToken,
        'content-type': 'application/json',
      },
      payload: {
        tenantId: 'partner-demo', // user only has skyra-internal membership
        projectId: 'partner-core',
        time_range: {
          start: '2026-10-28T04:00:00Z',
          end: '2026-10-28T05:00:00Z',
        },
      },
    });

    assert.equal(res.statusCode, 403);
    const body = JSON.parse(res.body);
    assert.equal(body.code, 'UNAUTHORIZED_PROJECT_ACCESS');
  });

  it('4. POST /bff/query/search rejects unauthenticated call with 401 Unauthorized', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/bff/query/search',
      headers: {
        origin: 'http://localhost:4200',
        'x-csrf-token': 'any',
        'content-type': 'application/json',
      },
      payload: {
        time_range: { start: '2026-10-28T04:00:00Z', end: '2026-10-28T05:00:00Z' },
      },
    });

    assert.equal(res.statusCode, 401);
  });

  it('5. POST /bff/query/search rejects invalid CSRF token with 403 Forbidden', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/bff/query/search',
      headers: {
        cookie: sessionCookie,
        origin: 'http://localhost:4200',
        'x-csrf-token': 'attacker_fake_token',
        'content-type': 'application/json',
      },
      payload: {
        projectId: 'auth-service',
        time_range: { start: '2026-10-28T04:00:00Z', end: '2026-10-28T05:00:00Z' },
      },
    });

    assert.equal(res.statusCode, 403);
  });

  it('6. POST /bff/query/facets forwards authorized facet discovery query', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/bff/query/facets',
      headers: {
        cookie: sessionCookie,
        origin: 'http://localhost:4200',
        'x-csrf-token': csrfToken,
        'content-type': 'application/json',
      },
      payload: {
        projectId: 'auth-service',
        time_range: {
          start: '2026-10-28T04:00:00Z',
          end: '2026-10-28T05:00:00Z',
        },
        facet_fields: ['service.name', 'log.level'],
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.ok(body.facets['service.name']);
    assert.equal(body.facets['service.name'][0].value, 'auth-service');
  });

  it('7. GET /bff/query/events/:eventId proxies point event lookup with projectId parameter', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/bff/query/events/00000000-0000-4000-8000-000000000001?projectId=auth-service&timestamp=2026-10-28T05:00:00.000Z',
      headers: {
        cookie: sessionCookie,
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.message, 'Single event lookup payload');
    assert.ok(lastUpstreamRequest.url?.includes('projectId=auth-service'));
    assert.ok(lastUpstreamRequest.url?.includes('date=2026-10-28'));
  });

  it('8. POST /bff/query/aggregate forwards batch aggregation query with internal scoped JWT', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/bff/query/aggregate',
      headers: {
        cookie: sessionCookie,
        origin: 'http://localhost:4200',
        'x-csrf-token': csrfToken,
        'content-type': 'application/json',
      },
      payload: {
        projectId: 'auth-service',
        time_range: {
          start: '2026-10-28T04:00:00Z',
          end: '2026-10-28T05:00:00Z',
        },
        aggregations: [
          { name: 'volume_over_time', type: 'date_histogram', field: '@timestamp', interval: '1h' },
          { name: 'severity_distribution', type: 'terms', field: 'log.level', size: 10 },
        ],
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.ok(body.aggregations.volume_over_time);
    assert.ok(body.aggregations.severity_distribution);
    assert.equal(lastUpstreamRequest.method, 'POST');
    assert.ok(lastUpstreamRequest.url?.includes('/query/v1/logs/aggregate'));
    assert.ok(lastUpstreamRequest.headers?.authorization?.startsWith('Bearer '));
    // Confirm client-sent projectId envelope key is stripped from clean payload
    assert.equal(lastUpstreamRequest.body.projectId, undefined);
    assert.deepEqual(lastUpstreamRequest.body.projects, ['auth-service']);
  });

  it('9. POST /bff/query/aggregate rejects unauthorized project scope with 403', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/bff/query/aggregate',
      headers: {
        cookie: sessionCookie,
        origin: 'http://localhost:4200',
        'x-csrf-token': csrfToken,
        'content-type': 'application/json',
      },
      payload: {
        projectId: 'proj-unauthorized-target',
        time_range: {
          start: '2026-10-28T04:00:00Z',
          end: '2026-10-28T05:00:00Z',
        },
        aggregations: [
          { name: 'volume_over_time', type: 'date_histogram', field: '@timestamp', interval: '1h' },
        ],
      },
    });

    assert.equal(res.statusCode, 403);
    const body = JSON.parse(res.body);
    assert.equal(body.code, 'UNAUTHORIZED_PROJECT_ACCESS');
  });
});
