import { describe, it, beforeEach } from 'node:test';
import * as assert from 'node:assert/strict';
import { createSkyraLogger } from '@skyra/logger-node';
import { SkyraLoggerService } from '../../dist/skyra-logger.service.js';
import { RequestContextService } from '../../dist/context/request-context.service.js';

describe('SkyraLoggerService (Unit)', () => {
  let contextService: RequestContextService;

  beforeEach(() => {
    contextService = new RequestContextService();
  });

  it('1. delegates info, warn, debug, trace, fatal, error methods', () => {
    const rawLogger = createSkyraLogger({
      projectId: 'skyra-erp',
      serviceName: 'erp-api',
      environment: 'test',
      instanceId: 'inst-01',
      level: 'trace',
      transport: { type: 'stdout' },
    });

    const service = new SkyraLoggerService(rawLogger, contextService);

    assert.doesNotThrow(() => {
      service.trace('Trace message', { step: 1 });
      service.debug('Debug message', { step: 2 });
      service.info('Info message', { step: 3 });
      service.warn('Warn message', { step: 4 });
      service.error('Error message', { step: 5, error: new Error('boom') });
      service.fatal('Fatal message', { step: 6 });
    });

    const status = service.getStatus();
    assert.equal(status.totalEventsSubmitted, 6);
    assert.equal(status.isClosed, false);
  });

  it('2. normalizes NestJS LoggerService calling signatures', () => {
    const rawLogger = createSkyraLogger({
      projectId: 'skyra-erp',
      serviceName: 'erp-api',
      environment: 'test',
      instanceId: 'inst-01',
      level: 'debug',
      transport: { type: 'stdout' },
    });

    const service = new SkyraLoggerService(rawLogger, contextService);

    // Standard NestJS log(msg, context)
    service.log('User registered', 'AuthService');
    // Standard NestJS error(msg, trace, context)
    service.error('Database query timed out', 'Error: timeout\n at Query.run', 'DatabaseModule');
    // Standard NestJS warn(msg, context)
    service.warn('Cache miss', 'CacheService');
    // Standard NestJS verbose(msg, context)
    service.verbose('HTTP response dispatched', 'HttpService');

    const status = service.getStatus();
    assert.equal(status.totalEventsSubmitted, 4);
  });

  it('3. enriches log events with active RequestContextService store', () => {
    const rawLogger = createSkyraLogger({
      projectId: 'skyra-erp',
      serviceName: 'erp-api',
      environment: 'test',
      instanceId: 'inst-01',
      level: 'info',
      transport: { type: 'stdout' },
    });

    const service = new SkyraLoggerService(rawLogger, contextService);

    contextService.run(
      {
        requestId: 'req-abc-123',
        traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
        spanId: '00f067aa0ba902b7',
        startTimeNs: process.hrtime.bigint(),
        customContext: { tenantId: 'tenant-42' },
      },
      () => {
        // Inside request scope
        assert.equal(contextService.getRequestId(), 'req-abc-123');
        assert.equal(contextService.getTraceId(), '4bf92f3577b34da6a3ce929d0e0e4736');
        assert.equal(contextService.getSpanId(), '00f067aa0ba902b7');

        service.info('Order placed', { orderId: 'ord-999' });
      }
    );

    // Outside request scope
    assert.equal(contextService.getRequestId(), undefined);
    service.info('Server maintenance completed');

    const status = service.getStatus();
    assert.equal(status.totalEventsSubmitted, 2);
  });

  it('4. creates child logger with inherited context without mutating parent', () => {
    const rawLogger = createSkyraLogger({
      projectId: 'skyra-erp',
      serviceName: 'erp-api',
      environment: 'test',
      instanceId: 'inst-01',
      level: 'info',
      transport: { type: 'stdout' },
    });

    const parentService = new SkyraLoggerService(rawLogger, contextService);
    const childService = parentService.child({ component: 'billing', version: '2.0' });

    assert.notEqual(parentService, childService);
    assert.doesNotThrow(() => {
      parentService.info('Parent message');
      childService.info('Child message');
    });

    const parentStatus = parentService.getStatus();
    const childStatus = childService.getStatus();
    assert.equal(parentStatus.totalEventsSubmitted, 1);
    assert.equal(childStatus.totalEventsSubmitted, 1);
    // Both share underlying queue and accepted events
    assert.equal(parentStatus.totalEventsAccepted, 2);
  });

  it('5. gracefully executes application shutdown hooks idempotently', async () => {
    const rawLogger = createSkyraLogger({
      projectId: 'skyra-erp',
      serviceName: 'erp-api',
      environment: 'test',
      instanceId: 'inst-01',
      level: 'info',
      transport: { type: 'stdout' },
    });

    const service = new SkyraLoggerService(rawLogger, contextService);

    await service.beforeApplicationShutdown('SIGTERM');
    await service.onApplicationShutdown('SIGTERM');

    // Repeated call should be safe and idempotent
    await service.onApplicationShutdown('SIGTERM');

    const status = service.getStatus();
    assert.equal(status.isClosed, true);
  });
});
