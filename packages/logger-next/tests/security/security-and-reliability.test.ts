import { describe, it, beforeEach } from 'node:test';
import * as assert from 'node:assert/strict';
import { parseStrictJson, validateLogEvent, type SkyraLogEvent } from '@skyra/logger-core';
import {
  createNextSkyraLogger,
  withSkyraLogging,
  sanitizeError,
  sanitizeRouteTemplate,
} from '../../src/index.js';
import { resetGlobalNextLogger } from '../../src/internal/singleton.js';

describe('Next.js Security & Reliability Hardening (Unit)', () => {
  beforeEach(() => {
    resetGlobalNextLogger();
  });
  it('1. nested cyclic errors do not crash logging', () => {
    const cyclic: any = new Error('Parent cyclic error');
    cyclic.self = cyclic;
    cyclic.nested = { ref: cyclic };

    const sanitized = sanitizeError(cyclic);
    assert.equal(sanitized.type, 'Error');
    assert.equal(sanitized.message, 'Parent cyclic error');
  });

  it('2. raw request and response bodies are excluded from HTTP completed events', async () => {
    const writtenEvents: SkyraLogEvent[] = [];
    const logger = createNextSkyraLogger({
      projectId: 'skyra-sec',
      serviceName: 'sec-web',
      environment: 'test',
      instanceId: 'inst-sec-01',
      level: 'trace',
      transport: { type: 'stdout' },
    });
    logger.getUnderlying().getTransport().write = async (_level, line) => {
      writtenEvents.push(parseStrictJson(line) as SkyraLogEvent);
    };

    const handler = withSkyraLogging(
      async (req: Request) => {
        // Consumer might read body in handler
        const body = await req.json();
        return Response.json({ success: true, received: body });
      },
      { route: '/api/checkout', logger }
    );

    const postReq = new Request('https://skyra.internal/api/checkout', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': 'Bearer super_secret_jwt_token',
        'cookie': 'session=secret_cookie_val',
      },
      body: JSON.stringify({
        creditCard: '4111-2222-3333-4444',
        cvv: '123',
        password: 'UserSecretPassword!',
      }),
    });

    const res = await handler(postReq);
    await logger.flush();

    assert.equal(res.status, 200);
    assert.equal(writtenEvents.length, 1);
    const event = writtenEvents[0]!;
    const eventStr = JSON.stringify(event);

    // Verify raw bodies and credentials are absent
    assert.ok(!eventStr.includes('4111-2222-3333-4444'), 'Credit card must not appear in log');
    assert.ok(!eventStr.includes('UserSecretPassword!'), 'Password must not appear in log');
    assert.ok(!eventStr.includes('super_secret_jwt_token'), 'Bearer token must not appear in log');
    assert.ok(!eventStr.includes('secret_cookie_val'), 'Cookie must not appear in log');
    assert.ok(!('body' in (event.http || {})), 'HTTP section must not contain body');
  });

  it('3. queue saturation holds hard memory limits and tracks drops under high load', () => {
    let droppedCount = 0;
    const logger = createNextSkyraLogger({
      projectId: 'skyra-sec-sat',
      serviceName: 'sec-web-sat',
      environment: 'test',
      instanceId: 'inst-sec-sat',
      level: 'info',
      transport: { type: 'stdout' },
      limits: {
        maxPendingEvents: 10,
        maxQueueMemoryBytes: 2000,
      },
      onDrop: (count) => {
        droppedCount += count;
      },
    });

    for (let i = 0; i < 50; i++) {
      logger.info(`Saturated load event ${i}`, { payload: 'y'.repeat(200) });
    }

    const status = logger.getStatus();
    assert.ok(status.droppedEventsCount > 0);
    assert.ok(status.pendingQueueCount <= 10);
  });

  it('4. canonical envelope fields cannot be overridden through caller metadata', async () => {
    const writtenEvents: SkyraLogEvent[] = [];
    const logger = createNextSkyraLogger({
      projectId: 'skyra-sec-over',
      serviceName: 'sec-web-over',
      environment: 'test',
      instanceId: 'inst-sec-03',
      level: 'trace',
      transport: { type: 'stdout' },
    });
    logger.getUnderlying().getTransport().write = async (_level, line) => {
      writtenEvents.push(parseStrictJson(line) as SkyraLogEvent);
    };

    logger.info('Caller trying to override canonical fields', {
      'ecs.version': '99.0.0',
      '@timestamp': '1999-01-01T00:00:00Z',
      service: { name: 'attacker' },
      skyra: { project_id: 'fake-project' },
      traceId: '00000000000000000000000000000000', // all zero invalid
      spanId: 'not-hex-and-bad', // invalid span
    });

    await logger.flush();

    assert.equal(writtenEvents.length, 1);
    const event = writtenEvents[0]!;

    assert.equal(event['ecs.version'], '8.11.0');
    assert.notEqual(event['@timestamp'], '1999-01-01T00:00:00Z');
    assert.equal(event.service.name, 'sec-web-over');
    assert.equal(event.skyra.project_id, 'skyra-sec-over');
    assert.equal(event.trace, undefined);
    assert.equal(event.span, undefined);
  });

  it('5. all emitted events strictly validate against canonical Ajv Draft 2020-12 schema', async () => {
    const writtenEvents: SkyraLogEvent[] = [];
    const logger = createNextSkyraLogger({
      projectId: 'skyra-sec',
      serviceName: 'sec-web',
      environment: 'test',
      instanceId: 'inst-sec-04',
      level: 'trace',
      transport: { type: 'stdout' },
    });
    logger.getUnderlying().getTransport().write = async (_level, line) => {
      writtenEvents.push(parseStrictJson(line) as SkyraLogEvent);
    };

    logger.info('Event validation test 1', {
      action: 'http.request.completed',
      outcome: 'success',
      category: ['web'],
      durationMs: 15.4,
      http: {
        request: { method: 'GET', id: 'req-val-1' },
        response: { status_code: 200 },
        route: '/api/test',
      },
    });

    logger.error('Event validation test 2', {
      action: 'database.query.failed',
      outcome: 'failure',
      category: ['database'],
      durationMs: 8.2,
      database: {
        system: 'postgresql',
        operation: 'SELECT',
        table: 'users',
      },
      error: new Error('connection closed'),
    });

    await logger.flush();

    assert.equal(writtenEvents.length, 2);
    for (const ev of writtenEvents) {
      const val = validateLogEvent(ev);
      assert.equal(val.valid, true, `Validation failed: ${JSON.stringify(val.errors)}`);
    }
  });
});
