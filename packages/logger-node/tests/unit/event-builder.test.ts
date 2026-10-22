import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateLogEvent } from '@skyra/logger-core';
import { buildCanonicalLogEvent } from '../../dist/event-builder.js';
import type { ResolvedSkyraLoggerConfig } from '../../dist/config.js';
import { DEFAULT_RESOURCE_LIMITS } from '../../dist/config.js';

function createMockConfig(overrides?: Partial<ResolvedSkyraLoggerConfig>): ResolvedSkyraLoggerConfig {
  const fixedDate = new Date('2026-10-22T10:00:00.000Z');
  return {
    projectId: 'skyra-test-proj',
    serviceName: 'test-api',
    environment: 'production',
    instanceId: 'inst-01',
    level: 'info',
    transport: { type: 'stdout' },
    additionalSensitiveKeys: [],
    limits: { ...DEFAULT_RESOURCE_LIMITS },
    fsyncOnLevels: new Set(['error', 'fatal']),
    clock: () => fixedDate,
    validationMode: 'off',
    ...overrides,
  };
}

describe('Event Builder & Canonical Schema Compliance', () => {
  it('1. Generates canonical event with all mandatory fields', () => {
    const config = createMockConfig();
    const event = buildCanonicalLogEvent(config, 'info', 'User signed in', {
      component: 'auth',
    });

    assert.equal(event['@timestamp'], '2026-10-22T10:00:00.000Z');
    assert.equal(event['ecs.version'], '8.11.0');
    assert.equal(event.skyra.schema_version, '1.0');
    assert.equal(event.skyra.project_id, 'skyra-test-proj');
    assert.equal(event.log.level, 'info');
    assert.equal(event.message, 'User signed in');
    assert.equal(event.service.name, 'test-api');
    assert.equal(event.service.environment, 'production');
    assert.ok(typeof event.event.id === 'string' && event.event.id.length === 36);

    const validation = validateLogEvent(event);
    assert.equal(validation.valid, true, `Validation failed: ${JSON.stringify(validation.errors)}`);
  });

  it('2. UUIDv4 generation strictly complies with version 4 and variant bits', () => {
    const config = createMockConfig();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    for (let i = 0; i < 20; i++) {
      const event = buildCanonicalLogEvent(config, 'info', `Event ${i}`);
      assert.ok(uuidRegex.test(event.event.id), `ID '${event.event.id}' must be valid UUIDv4`);
    }
  });

  it('3. Error serialization captures type, message, and sanitized stack trace', () => {
    const config = createMockConfig();
    const sampleError = new Error('Database connection failed');
    sampleError.name = 'DatabaseError';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sampleError as any).code = 'ECONNREFUSED';

    const event = buildCanonicalLogEvent(config, 'error', 'Payment failed', {
      error: sampleError,
    });

    assert.ok(event.error);
    assert.equal(event.error.type, 'DatabaseError');
    assert.equal(event.error.message, 'Database connection failed');
    assert.equal(event.error.code, 'ECONNREFUSED');
    assert.ok(event.error.stack_trace && event.error.stack_trace.includes('DatabaseError'));

    const validation = validateLogEvent(event);
    assert.equal(validation.valid, true, `Errors: ${JSON.stringify(validation.errors)}`);
  });

  it('4. Sensitive data redaction handles passwords, Bearer tokens, JWTs, and URLs', () => {
    const config = createMockConfig({
      additionalSensitiveKeys: ['customSecretToken'],
    });

    const event = buildCanonicalLogEvent(config, 'warn', 'Security check', {
      password: 'super-secret-password-123',
      authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotLeak',
      cookie: 'session_id=abcdef123456',
      customSecretToken: 'app-secret-xyz',
      database: {
        statement_sanitized: 'SELECT * FROM users WHERE pass = postgres://admin:hunter2@db.internal:5432/main',
      },
      url: {
        path: '/v1/auth',
        query: 'action=login&token=rawSecretToken123',
      },
    });

    // Check key redaction
    assert.equal((event.skyra.business as any)?.password, '[REDACTED]');
    assert.equal((event.skyra.business as any)?.authorization, '[REDACTED]');
    assert.equal((event.skyra.business as any)?.cookie, '[REDACTED]');
    assert.equal((event.skyra.business as any)?.customSecretToken, '[REDACTED]');

    // Check URL embedded credentials pattern redaction
    assert.ok(event.database?.statement_sanitized?.includes('postgres://admin:[REDACTED]@'));
    assert.ok(!event.database?.statement_sanitized?.includes('hunter2'));

    // Check URL query token redaction
    assert.ok(event.url?.query?.includes('&token=[REDACTED]'));
    assert.ok(!event.url?.query?.includes('rawSecretToken123'));

    const validation = validateLogEvent(event);
    assert.equal(validation.valid, true, `Errors: ${JSON.stringify(validation.errors)}`);
  });

  it('5. Handles circular references without crashing or stack overflow', () => {
    const config = createMockConfig();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const circularObj: any = { name: 'cyclic' };
    circularObj.self = circularObj;

    const event = buildCanonicalLogEvent(config, 'info', 'Circular test', {
      data: circularObj,
    });

    assert.ok(event.skyra.business);
    assert.equal((event.skyra.business as any).data.name, 'cyclic');
    assert.equal((event.skyra.business as any).data.self, '[Circular]');
  });

  it('6. Timing units: event.duration is nanoseconds and skyra.duration_ms is milliseconds', () => {
    const config = createMockConfig();
    const event = buildCanonicalLogEvent(config, 'info', 'HTTP call completed', {
      durationMs: 125.5,
    });

    assert.equal(event.skyra.duration_ms, 125.5);
    assert.equal(event.event.duration, 125500000); // 125.5 ms * 1,000,000 = 125,500,000 ns

    const validation = validateLogEvent(event);
    assert.equal(validation.valid, true, `Errors: ${JSON.stringify(validation.errors)}`);
  });

  it('7. Normalizes legacy environment and underscore action names', () => {
    const config = createMockConfig({
      environment: 'dev' as any,
    });
    const event = buildCanonicalLogEvent(config, 'info', 'API call', {
      action: 'http_request',
    });

    assert.equal(event.service.environment, 'development');
    assert.equal(event.event.action, 'http.request.completed');

    const validation = validateLogEvent(event);
    assert.equal(validation.valid, true, `Errors: ${JSON.stringify(validation.errors)}`);
  });
});
