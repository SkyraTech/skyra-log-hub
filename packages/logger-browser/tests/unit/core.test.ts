/**
 * @skyra/logger-browser - Core Functionality Unit Tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateLogEvent } from '@skyra/logger-core/validator';
import {
  createSkyraBrowserLogger,
  SkyraBrowserLogger,
  MemoryTransport,
  ConsoleTransport,
  generateBrowserUuid,
  isValidUuidV4,
} from '../../src/index.js';

describe('Logger Browser: Core Functionality', () => {
  it('1. Generates valid canonical event structure', async () => {
    const memory = new MemoryTransport();
    const logger = createSkyraBrowserLogger({
      projectId: 'skyra-portal',
      serviceName: 'portal-web',
      environment: 'production',
      level: 'debug',
      transport: memory,
    });

    logger.info('Dashboard view loaded', { component: 'dashboard' });
    await logger.flush();

    const events = memory.getEvents();
    assert.equal(events.length, 1);
    const ev = events[0]!;

    assert.equal(ev['ecs.version'], '8.11.0');
    assert.equal(ev.skyra.schema_version, '1.0.0');
    assert.equal(ev.skyra.project_id, 'skyra-portal');
    assert.equal(ev.service.name, 'portal-web');
    assert.equal(ev.service.environment, 'production');
    assert.equal(ev.log.level, 'info');
    assert.equal(ev.message, 'Dashboard view loaded');
    assert.equal(ev.skyra.component, 'dashboard');
    assert.ok(isValidUuidV4(ev.event.id));
    assert.ok(ev['@timestamp'].endsWith('Z'));

    const val = validateLogEvent(ev);
    assert.equal(val.valid, true, `Validation failed: ${JSON.stringify(val.errors)}`);
  });

  it('2. Generates cryptographically secure RFC 4122 UUIDv4 identifiers', () => {
    const id1 = generateBrowserUuid();
    const id2 = generateBrowserUuid();
    assert.notEqual(id1, id2);
    assert.ok(isValidUuidV4(id1));
    assert.ok(isValidUuidV4(id2));
    assert.equal(id1.charAt(14), '4', 'Version nibble must be 4');
    assert.ok(['8', '9', 'a', 'b', 'A', 'B'].includes(id1.charAt(19)), 'Variant must be 8, 9, a, or b');
  });

  it('3. Generates valid UTC ISO 8601 timestamps ending in Z', async () => {
    const memory = new MemoryTransport();
    const logger = createSkyraBrowserLogger({
      projectId: 'skyra-erp',
      serviceName: 'erp-web',
      environment: 'staging',
      transport: memory,
    });

    logger.warn('Token expiring soon');
    await logger.flush();

    const ev = memory.getEvents()[0]!;
    assert.match(ev['@timestamp'], /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,9})?Z$/);
  });

  it('4. Filters events by severity level', async () => {
    const memory = new MemoryTransport();
    const logger = createSkyraBrowserLogger({
      projectId: 'skyra-erp',
      serviceName: 'erp-web',
      environment: 'production',
      level: 'warn',
      transport: memory,
    });

    assert.equal(logger.isLevelEnabled('debug'), false);
    assert.equal(logger.isLevelEnabled('info'), false);
    assert.equal(logger.isLevelEnabled('warn'), true);
    assert.equal(logger.isLevelEnabled('error'), true);

    logger.debug('Ignored debug');
    logger.info('Ignored info');
    logger.warn('Accepted warning');
    logger.error('Accepted error');
    await logger.flush();

    const events = memory.getEvents();
    assert.equal(events.length, 2);
    assert.equal(events[0]!.log.level, 'warn');
    assert.equal(events[1]!.log.level, 'error');
  });

  it('5. Child logger inherits configuration and context', async () => {
    const memory = new MemoryTransport();
    const parent = createSkyraBrowserLogger({
      projectId: 'skyra-portal',
      serviceName: 'portal-web',
      environment: 'production',
      transport: memory,
      component: 'core',
    });

    const child = parent.child({
      component: 'checkout-widget',
      labels: { region: 'us-east-1' },
      tags: ['ecommerce', 'v2'],
    });

    child.info('Payment button clicked');
    await parent.flush();

    const events = memory.getEvents();
    assert.equal(events.length, 1);
    const ev = events[0]!;
    assert.equal(ev.skyra.component, 'checkout-widget');
    assert.deepEqual(ev.labels, { region: 'us-east-1' });
    assert.deepEqual(ev.tags, ['ecommerce', 'v2']);
  });

  it('6. Preserves metadata immutability and protects envelope against override', async () => {
    const memory = new MemoryTransport();
    const logger = createSkyraBrowserLogger({
      projectId: 'trusted-project',
      serviceName: 'trusted-service',
      environment: 'production',
      transport: memory,
    });

    const maliciousMeta = {
      project_id: 'hacked-project',
      service: { name: 'hacked-service' },
      'ecs.version': '0.0.0',
      nested: { counter: 1 },
    };

    logger.info('Test security override', maliciousMeta);
    await logger.flush();

    // Verify caller object was not mutated
    assert.equal(maliciousMeta.nested.counter, 1);

    const ev = memory.getEvents()[0]!;
    assert.equal(ev.skyra.project_id, 'trusted-project');
    assert.equal(ev.service.name, 'trusted-service');
    assert.equal(ev['ecs.version'], '8.11.0');
  });

  it('7. Strict validation against canonical JSON Schema v1', async () => {
    const memory = new MemoryTransport();
    const logger = createSkyraBrowserLogger({
      projectId: 'schema-test',
      serviceName: 'validator-app',
      environment: 'test',
      transport: memory,
      validateEvents: true,
    });

    logger.info('Schema test event', {
      order_id: 'ord-12345',
      user: { id: 'usr-999' },
    });
    await logger.flush();

    const ev = memory.getEvents()[0]!;
    const val = validateLogEvent(ev);
    assert.equal(val.valid, true);
  });

  it('8. Deep redaction of passwords, tokens, API keys and credentials', async () => {
    const memory = new MemoryTransport();
    const logger = createSkyraBrowserLogger({
      projectId: 'security-test',
      serviceName: 'redaction-app',
      environment: 'production',
      transport: memory,
    });

    logger.info('User authenticated', {
      password: 'super-secret-password-123',
      api_key: 'sk_live_1234567890abcdef',
      nested: {
        authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.t-IDcSemACt8x4iTMCda8Yhe3iZaWbvV5XKSTbuAn0M',
        refresh_token: 'refresh_token_abc_xyz',
      },
    });
    await logger.flush();

    const ev = memory.getEvents()[0]!;
    const business = ev.skyra.business as Record<string, unknown>;
    assert.equal(business['password'], '[REDACTED]');
    assert.equal(business['api_key'], '[REDACTED]');
    const nested = business['nested'] as Record<string, unknown>;
    assert.equal(nested['authorization'], '[REDACTED]');
    assert.equal(nested['refresh_token'], '[REDACTED]');
  });

  it('9. Enforces message length and string truncation bounds', async () => {
    const memory = new MemoryTransport();
    const logger = createSkyraBrowserLogger({
      projectId: 'bounds-test',
      serviceName: 'truncation-app',
      environment: 'production',
      transport: memory,
      limits: {
        maxMessageLength: 50,
      },
    });

    const longMessage = 'A'.repeat(200);
    logger.info(longMessage);
    await logger.flush();

    const ev = memory.getEvents()[0]!;
    assert.ok(ev.message.length <= 50);
    assert.ok(ev.message.endsWith('... [truncated]'));
  });

  it('10. Safely handles circular object references without crashing', async () => {
    const memory = new MemoryTransport();
    const logger = createSkyraBrowserLogger({
      projectId: 'circular-test',
      serviceName: 'circular-app',
      environment: 'production',
      transport: memory,
    });

    const circularObj: Record<string, unknown> = { name: 'circular-node' };
    circularObj['self'] = circularObj;

    assert.doesNotThrow(() => {
      logger.info('Logging circular structure', { payload: circularObj });
    });
    await logger.flush();

    const ev = memory.getEvents()[0]!;
    const business = ev.skyra.business as Record<string, unknown>;
    const payload = business['payload'] as Record<string, unknown>;
    assert.equal(payload['self'], '[Circular]');
  });

  it('11. Bounded memory transport respects maxEvents limit (FIFO drop)', async () => {
    const memory = new MemoryTransport({ maxEvents: 3 });
    const logger = createSkyraBrowserLogger({
      projectId: 'bound-test',
      serviceName: 'fifo-app',
      environment: 'test',
      transport: memory,
    });

    logger.info('Event 1');
    logger.info('Event 2');
    logger.info('Event 3');
    logger.info('Event 4');
    await logger.flush();

    assert.equal(memory.getEventCount(), 3);
    const events = memory.getEvents();
    assert.equal(events[0]!.message, 'Event 2');
    assert.equal(events[1]!.message, 'Event 3');
    assert.equal(events[2]!.message, 'Event 4');
  });

  it('12. Console transport formats sanitized output without throwing', async () => {
    const consoleTransport = new ConsoleTransport({ useColors: false });
    const logger = createSkyraBrowserLogger({
      projectId: 'console-test',
      serviceName: 'console-app',
      environment: 'development',
      transport: consoleTransport,
    });

    assert.doesNotThrow(() => {
      logger.info('Testing console output', { key: 'value' });
      logger.error('Testing console error', { error: new Error('Simulated failure') });
    });
    await logger.flush();
  });
});
