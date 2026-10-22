import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { createSkyraLogger } from '@skyra/logger-node';
import { validateLogEvent, parseStrictJson } from '@skyra/logger-core';
import type { SkyraLogEvent } from '@skyra/logger-core';
import { SkyraLoggerService } from '../../dist/skyra-logger.service.js';
import { RequestContextService } from '../../dist/context/request-context.service.js';
import { sanitizeError } from '../../dist/internal/error-sanitizer.js';
import { sanitizeRouteTemplate } from '../../dist/internal/route-sanitizer.js';
import { buildHttpCompletedEventContext } from '../../dist/internal/http-event-builder.js';

describe('Security & Reliability Invariants (NestJS Adapter)', () => {
  it('1. nested errors and cyclic references do not crash logging', () => {
    const cyclicErr: any = new Error('Cyclic parent');
    cyclicErr.cause = { nested: cyclicErr };

    const sanitized = sanitizeError(cyclicErr);
    assert.equal(sanitized.type, 'Error');
    assert.equal(sanitized.message, 'Cyclic parent');
  });

  it('2. raw request and response bodies are excluded from HTTP completed events', () => {
    const eventContext = buildHttpCompletedEventContext({
      method: 'POST',
      statusCode: 200,
      durationMs: 45.2,
      durationNs: 45200000,
      routeTemplate: '/api/v1/checkout',
      requestId: 'req-secure-01',
    });

    const contextStr = JSON.stringify(eventContext);
    assert.ok(!contextStr.includes('requestBody'));
    assert.ok(!contextStr.includes('responseBody'));
    assert.ok(!contextStr.includes('body'));
  });

  it('3. sensitive tokens, authorization headers and cookies are never persisted', () => {
    const rawPathWithSecrets =
      '/api/v1/auth/callback?code=def_secret_code_12345&access_token=ya29.a0AfH6SM...&cookie=session_id%3Dxyz';
    const sanitized = sanitizeRouteTemplate(rawPathWithSecrets);

    assert.equal(sanitized, '/api/v1/auth/callback');
    assert.ok(!sanitized.includes('def_secret_code_12345'));
    assert.ok(!sanitized.includes('ya29.a0AfH6SM'));
    assert.ok(!sanitized.includes('session_id'));
  });

  it('4. concurrent requests maintain strict AsyncLocalStorage context isolation', async () => {
    const contextService = new RequestContextService();
    const count = 50;

    const runRequest = async (id: number) => {
      const requestId = `req-iso-${id}`;
      const traceId = `${id}`.padStart(32, '0');
      const spanId = `${id}`.padStart(16, '0');

      return contextService.run(
        {
          requestId,
          traceId,
          spanId,
          startTimeNs: process.hrtime.bigint(),
          customContext: { runIndex: id },
        },
        async () => {
          // Simulate variable async delay
          await new Promise((res) => setTimeout(res, Math.random() * 20));

          // Verify no cross-talk occurred during async delay
          assert.equal(contextService.getRequestId(), requestId);
          assert.equal(contextService.getTraceId(), traceId);
          assert.equal(contextService.getSpanId(), spanId);
          assert.equal(contextService.get('runIndex'), id);
          return id;
        }
      );
    };

    const results = await Promise.all(Array.from({ length: count }, (_, i) => runRequest(i)));
    assert.equal(results.length, count);
  });

  it('5. logger queue saturation holds hard memory limits and tracks drops', () => {
    let droppedCount = 0;
    const rawLogger = createSkyraLogger({
      projectId: 'skyra-erp',
      serviceName: 'erp-api',
      environment: 'test',
      instanceId: 'inst-sat-01',
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

    const service = new SkyraLoggerService(rawLogger);

    // Flood with events
    for (let i = 0; i < 50; i++) {
      service.info(`High volume payload event index ${i}`, {
        payload: 'x'.repeat(200),
      });
    }

    const status = service.getStatus();
    assert.ok(status.droppedEventsCount > 0);
    assert.ok(status.pendingQueueCount <= 10);
  });

  it('6. every emitted event validates against canonical Ajv Draft 2020-12 schema', () => {
    const rawLogger = createSkyraLogger({
      projectId: 'skyra-erp',
      serviceName: 'erp-api',
      environment: 'test',
      instanceId: 'inst-schema-01',
      level: 'trace',
      transport: { type: 'stdout' },
    });

    const writtenLines: string[] = [];
    // Intercept underlying transport write
    const origWrite = rawLogger.getTransport().write.bind(rawLogger.getTransport());
    rawLogger.getTransport().write = async (level, line, bytes) => {
      writtenLines.push(line);
      return origWrite(level, line, bytes);
    };

    const service = new SkyraLoggerService(rawLogger);

    service.info('Test canonical event', {
      component: 'test-runner',
      action: 'http.request.completed',
      outcome: 'success',
      category: ['web'],
      durationMs: 12.345,
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
      spanId: '00f067aa0ba902b7',
      http: {
        request: { method: 'GET', id: 'req-val-01' },
        response: { status_code: 200 },
        route: '/api/v1/health',
      },
      skyra: {
        http: { route_template: '/api/v1/health' },
      },
    });

    // Parse and validate each line
    for (const line of writtenLines) {
      const parsed = parseStrictJson(line) as SkyraLogEvent;
      const result = validateLogEvent(parsed);
      assert.equal(
        result.valid,
        true,
        `Validation failed: ${JSON.stringify(result.errors)} for line: ${line}`
      );
    }
  });
});
