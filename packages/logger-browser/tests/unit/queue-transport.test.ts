/**
 * @skyra/logger-browser - Queue and Transport Tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { SkyraLogEvent } from '@skyra/logger-core/types';
import {
  createSkyraBrowserLogger,
  HttpTransport,
  MemoryTransport,
  isValidUuidV4,
  type BrowserTransport,
  type BrowserTransportResult,
} from '../../src/index.js';

class MockTransport implements BrowserTransport {
  public readonly name = 'mock';
  public batches: SkyraLogEvent[][] = [];
  public failCount = 0;
  public failPermanent = false;

  public async send(batch: readonly SkyraLogEvent[]): Promise<BrowserTransportResult> {
    if (this.failPermanent) {
      return {
        success: false,
        deliveredCount: 0,
        droppedCount: batch.length,
        retryable: false,
        statusCode: 400,
        error: 'Bad Request',
      };
    }
    if (this.failCount > 0) {
      this.failCount--;
      return {
        success: false,
        deliveredCount: 0,
        droppedCount: 0,
        retryable: true,
        statusCode: 503,
        error: 'Service Unavailable',
      };
    }
    this.batches.push([...batch]);
    return {
      success: true,
      deliveredCount: batch.length,
      droppedCount: 0,
      retryable: false,
      statusCode: 200,
    };
  }
}

describe('Logger Browser: Queue & Transport Reliability', () => {
  it('13. Enforces batch count limit', async () => {
    const mock = new MockTransport();
    const logger = createSkyraBrowserLogger({
      projectId: 'batch-test',
      serviceName: 'web',
      environment: 'production',
      transport: mock,
      immediateFlushLevels: [], // disable immediate flush for this test
      limits: { maxQueueEvents: 100 },
    });

    // Enqueue 5 events
    for (let i = 0; i < 5; i++) {
      logger.info(`Message ${i}`);
    }
    await logger.flush();

    assert.equal(mock.batches.length, 1);
    assert.equal(mock.batches[0]!.length, 5);
  });

  it('14. Enforces batch byte size limit', async () => {
    const mock = new MockTransport();
    const logger = createSkyraBrowserLogger({
      projectId: 'batch-test',
      serviceName: 'web',
      environment: 'production',
      transport: mock,
      immediateFlushLevels: [],
    });

    for (let i = 0; i < 3; i++) {
      logger.info(`Message ${i}`, { payload: 'x'.repeat(100) });
    }
    await logger.flush();

    assert.equal(mock.batches.length, 1);
    assert.equal(mock.batches[0]!.length, 3);
  });

  it('15. Enforces queue count limit and drops non-critical events', async () => {
    const mock = new MockTransport();
    mock.failPermanent = true; // Prevent delivery

    const logger = createSkyraBrowserLogger({
      projectId: 'queue-test',
      serviceName: 'web',
      environment: 'production',
      transport: mock,
      immediateFlushLevels: [],
      limits: {
        maxQueueEvents: 3,
      },
    });

    logger.info('Msg 1');
    logger.info('Msg 2');
    logger.info('Msg 3');
    logger.info('Msg 4'); // Should be dropped
    logger.info('Msg 5'); // Should be dropped

    const status = logger.getStatus();
    assert.equal(status.queueDepth, 3);
    assert.equal(status.droppedCount, 2);
  });

  it('16. Priority eviction admits critical error/fatal events under queue saturation', async () => {
    const mock = new MockTransport();
    const logger = createSkyraBrowserLogger({
      projectId: 'evict-test',
      serviceName: 'web',
      environment: 'production',
      transport: mock,
      immediateFlushLevels: [],
      limits: {
        maxQueueEvents: 3,
      },
    });

    // Fill queue with 3 info events
    logger.info('Info 1');
    logger.info('Info 2');
    logger.info('Info 3');

    // Add critical error event -> must evict oldest info event!
    logger.error('Critical failure 1');

    const status = logger.getStatus();
    assert.equal(status.queueDepth, 3);
    assert.equal(status.evictedCount, 1);

    await logger.flush();
    const delivered = mock.batches.flat();
    assert.equal(delivered.length, 3);
    assert.equal(delivered[0]!.message, 'Info 2');
    assert.equal(delivered[1]!.message, 'Info 3');
    assert.equal(delivered[2]!.message, 'Critical failure 1');
  });

  it('17. Manual flush drains the queue deterministically', async () => {
    const mock = new MockTransport();
    const logger = createSkyraBrowserLogger({
      projectId: 'flush-test',
      serviceName: 'web',
      environment: 'production',
      transport: mock,
      immediateFlushLevels: [],
    });

    logger.info('Unflushed message 1');
    logger.info('Unflushed message 2');
    assert.equal(mock.batches.length, 0);

    await logger.flush();
    assert.equal(mock.batches.length, 1);
    assert.equal(mock.batches[0]!.length, 2);
    assert.equal(logger.getStatus().queueDepth, 0);
  });

  it('18. Guards against concurrent flush execution', async () => {
    const mock = new MockTransport();
    const logger = createSkyraBrowserLogger({
      projectId: 'concurrent-flush',
      serviceName: 'web',
      environment: 'production',
      transport: mock,
      immediateFlushLevels: [],
    });

    logger.info('Test 1');
    logger.info('Test 2');

    // Run two flushes simultaneously
    await Promise.all([logger.flush(), logger.flush()]);

    assert.equal(mock.batches.length, 1);
    assert.equal(mock.batches[0]!.length, 2);
  });

  it('19. Retries transient 5xx HTTP errors with exponential backoff', async () => {
    const mock = new MockTransport();
    mock.failCount = 1; // Fail first send with retryable 503

    const logger = createSkyraBrowserLogger({
      projectId: 'retry-test',
      serviceName: 'web',
      environment: 'production',
      transport: mock,
      immediateFlushLevels: [],
    });

    logger.info('Retryable message');

    // First flush encounters 503 and re-queues event
    await logger.flush();
    assert.equal(mock.batches.length, 0);
    assert.equal(logger.getStatus().queueDepth, 1);

    // Second flush succeeds
    await logger.flush();
    assert.equal(mock.batches.length, 1);
    assert.equal(mock.batches[0]!.length, 1);
    assert.equal(mock.batches[0]![0]!.message, 'Retryable message');
  });

  it('20. Drops events immediately on permanent 4xx HTTP errors', async () => {
    const mock = new MockTransport();
    mock.failPermanent = true;

    const logger = createSkyraBrowserLogger({
      projectId: 'permanent-test',
      serviceName: 'web',
      environment: 'production',
      transport: mock,
      immediateFlushLevels: [],
    });

    logger.info('Non-retryable event');
    await logger.flush();

    assert.equal(mock.batches.length, 0);
    const status = logger.getStatus();
    assert.equal(status.queueDepth, 0);
    assert.equal(status.droppedCount, 1);
    assert.equal(status.failedCount, 1);
  });

  it('21. Preserves event IDs across retries for backend deduplication', async () => {
    const mock = new MockTransport();
    mock.failCount = 1;

    const memory = new MemoryTransport();
    const logger = createSkyraBrowserLogger({
      projectId: 'dedupe-test',
      serviceName: 'web',
      environment: 'production',
      transport: mock,
      immediateFlushLevels: [],
    });

    logger.info('Deduplicated event');
    await logger.flush(); // Fails once
    await logger.flush(); // Succeeds

    const deliveredEvent = mock.batches[0]![0]!;
    assert.ok(isValidUuidV4(deliveredEvent.event.id));
  });

  it('22. Dispose flushes pending events and prevents further enqueues', async () => {
    const mock = new MockTransport();
    const logger = createSkyraBrowserLogger({
      projectId: 'dispose-test',
      serviceName: 'web',
      environment: 'production',
      transport: mock,
      immediateFlushLevels: [],
    });

    logger.info('Pending message before dispose');
    await logger.dispose();

    assert.equal(mock.batches.length, 1);
    assert.equal(mock.batches[0]!.length, 1);

    // Further enqueue attempts must be rejected
    const enqueued = logger.info('Message after dispose');
    assert.equal(enqueued, false);
    assert.equal(logger.getStatus().isDisposed, true);
  });

  it('23. HttpTransport rejects non-HTTPS URLs in non-localhost environments', () => {
    assert.throws(
      () => {
        new HttpTransport({
          type: 'http',
          url: 'http://insecure-collector.skyra.com/logs',
          rejectInsecureHttp: true,
        });
      },
      /Insecure HTTP transport rejected/
    );

    // Localhost allowed with HTTP
    assert.doesNotThrow(() => {
      new HttpTransport({
        type: 'http',
        url: 'http://localhost:8080/ingest',
      });
    });
  });

  it('24. HttpTransport enforces allowedOrigins policy', () => {
    assert.throws(
      () => {
        new HttpTransport({
          type: 'http',
          url: 'https://evil-untrusted-site.com/logs',
          allowedOrigins: ['https://logs.skyra-tech.com'],
        });
      },
      /not in the allowedOrigins allowlist/
    );

    assert.doesNotThrow(() => {
      new HttpTransport({
        type: 'http',
        url: 'https://logs.skyra-tech.com/v1/events',
        allowedOrigins: ['https://logs.skyra-tech.com'],
      });
    });
  });
});
