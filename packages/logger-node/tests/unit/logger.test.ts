import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createSkyraLogger } from '../../dist/logger.js';
import type { SkyraTransport, TransportStatus } from '../../dist/transports/transport.interface.js';
import type { LogLevel } from '@skyra/logger-core';
import { parseStrictJson } from '@skyra/logger-core';

class MockTransport implements SkyraTransport {
  public writtenEvents: Array<{ level: LogLevel; line: string; parsed: any }> = [];
  public emergencyEvents: Array<{ level: LogLevel; line: string }> = [];
  public flushed = false;
  public closed = false;

  public async write(level: LogLevel, line: string): Promise<void> {
    this.writtenEvents.push({ level, line, parsed: parseStrictJson(line) });
  }

  public emergencyWrite(level: LogLevel, line: string): void {
    this.emergencyEvents.push({ level, line });
  }

  public async flush(): Promise<void> {
    this.flushed = true;
  }

  public async close(): Promise<void> {
    this.closed = true;
  }

  public getStatus(): TransportStatus {
    return {
      totalEventsWritten: this.writtenEvents.length,
      totalBytesWritten: 0,
      isClosed: this.closed,
    };
  }
}

describe('SkyraLogger API & Core Behavior', () => {
  it('1. Filters events according to severity threshold', async () => {
    const mock = new MockTransport();
    const logger = createSkyraLogger({
      projectId: 'skyra-test',
      serviceName: 'test-svc',
      environment: 'production',
      instanceId: 'inst-01',
      level: 'info',
      transport: { type: 'stdout' },
    });
    // Inject mock transport
    (logger as any).transport = mock;
    (logger as any).writeQueue.writeHandler = async (batch: any[]) => {
      for (const item of batch) {
        await mock.write(item.level, item.line);
      }
    };

    logger.trace('Trace msg');
    logger.debug('Debug msg');
    logger.info('Info msg');
    logger.warn('Warn msg');
    logger.error('Error msg');
    logger.fatal('Fatal msg');

    await logger.flush();

    // trace and debug must be filtered out
    const messages = mock.writtenEvents.map((e) => e.parsed.message);
    assert.deepEqual(messages, ['Info msg', 'Warn msg', 'Error msg', 'Fatal msg']);

    await logger.close();
  });

  it('2. Dynamically updates level threshold with setLevel and isLevelEnabled', async () => {
    const mock = new MockTransport();
    const logger = createSkyraLogger({
      projectId: 'skyra-test',
      serviceName: 'test-svc',
      environment: 'production',
      instanceId: 'inst-01',
      level: 'warn',
    });
    (logger as any).transport = mock;
    (logger as any).writeQueue.writeHandler = async (batch: any[]) => {
      for (const item of batch) {
        await mock.write(item.level, item.line);
      }
    };

    assert.equal(logger.isLevelEnabled('info'), false);
    assert.equal(logger.isLevelEnabled('warn'), true);
    assert.equal(logger.isLevelEnabled('error'), true);

    logger.info('Should not be written');
    await logger.flush();
    assert.equal(mock.writtenEvents.length, 0);

    // Change level to debug
    logger.setLevel('debug');
    assert.equal(logger.isLevelEnabled('debug'), true);
    assert.equal(logger.isLevelEnabled('trace'), false);

    logger.debug('Now debug should be written');
    await logger.flush();
    assert.equal(mock.writtenEvents.length, 1);
    assert.equal(mock.writtenEvents[0]?.parsed.message, 'Now debug should be written');

    await logger.close();
  });

  it('3. Child logger inherits parent context without mutating the parent', async () => {
    const mock = new MockTransport();
    const parentLogger = createSkyraLogger({
      projectId: 'skyra-test',
      serviceName: 'parent-svc',
      environment: 'production',
      instanceId: 'inst-01',
      level: 'info',
    });
    (parentLogger as any).transport = mock;
    (parentLogger as any).writeQueue.writeHandler = async (batch: any[]) => {
      for (const item of batch) {
        await mock.write(item.level, item.line);
      }
    };

    const childLogger = parentLogger.child({
      component: 'payment-gateway',
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
    });

    childLogger.info('Child log message', { attempt: 1 });
    parentLogger.info('Parent log message', { attempt: 2 });

    await parentLogger.flush();

    assert.equal(mock.writtenEvents.length, 2);

    const childEvent = mock.writtenEvents[0]?.parsed;
    assert.equal(childEvent.message, 'Child log message');
    assert.equal(childEvent.skyra.component, 'payment-gateway');
    assert.equal(childEvent.trace?.id, '4bf92f3577b34da6a3ce929d0e0e4736');
    assert.equal(childEvent.skyra.business?.attempt, 1);

    const parentEvent = mock.writtenEvents[1]?.parsed;
    assert.equal(parentEvent.message, 'Parent log message');
    assert.equal(parentEvent.skyra.component, undefined);
    assert.equal(parentEvent.trace, undefined);
    assert.equal(parentEvent.skyra.business?.attempt, 2);

    await parentLogger.close();
  });

  it('4. Rejects log writes after logger closure', async () => {
    const mock = new MockTransport();
    const logger = createSkyraLogger({
      projectId: 'skyra-test',
      serviceName: 'test-svc',
      environment: 'production',
      instanceId: 'inst-01',
      level: 'info',
    });
    (logger as any).transport = mock;
    (logger as any).writeQueue.writeHandler = async (batch: any[]) => {
      for (const item of batch) {
        await mock.write(item.level, item.line);
      }
    };

    logger.info('Message before close');
    await logger.close();

    // Attempt write after close
    logger.info('Message after close');
    await logger.flush();

    assert.equal(mock.writtenEvents.length, 1);
    assert.equal(mock.writtenEvents[0]?.parsed.message, 'Message before close');
  });

  it('5. getStatus returns comprehensive health metrics', async () => {
    const logger = createSkyraLogger({
      projectId: 'skyra-erp',
      serviceName: 'erp-api',
      environment: 'staging',
      instanceId: 'inst-99',
      level: 'debug',
    });

    const status = logger.getStatus();
    assert.equal(status.projectId, 'skyra-erp');
    assert.equal(status.serviceName, 'erp-api');
    assert.equal(status.environment, 'staging');
    assert.equal(status.instanceId, 'inst-99');
    assert.equal(status.level, 'debug');
    assert.equal(status.isClosed, false);
    assert.equal(status.pendingQueueCount, 0);

    await logger.close();
  });
});
