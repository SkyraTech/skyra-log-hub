/**
 * @skyra/logger-browser - Fetch Instrumentation & Lifecycle Tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createSkyraBrowserLogger,
  MemoryTransport,
  instrumentFetch,
  installLifecycleHandlers,
} from '../../src/index.js';

describe('Logger Browser: Fetch & Lifecycle Instrumentation', () => {
  it('44. instrumentFetch measures successful HTTP requests', async () => {
    const memory = new MemoryTransport();
    const logger = createSkyraBrowserLogger({
      projectId: 'fetch-test',
      serviceName: 'web',
      environment: 'production',
      transport: memory,
    });

    const mockFetch = async () => {
      return {
        status: 200,
        statusText: 'OK',
        ok: true,
      } as unknown as Response;
    };

    const res = await instrumentFetch(
      logger,
      'https://api.skyra.com/v1/orders/123?auth=secretToken',
      { method: 'GET' },
      mockFetch as unknown as typeof fetch
    );

    assert.equal(res.status, 200);
    await logger.flush();

    const ev = memory.getEvents()[0]!;
    assert.equal(ev.event.action, 'http.request.completed');
    assert.equal(ev.event.outcome, 'success');
    assert.equal(ev.http?.route, '/v1/orders/123');
    assert.equal(ev.http?.response?.status_code, 200);
    assert.ok(ev.event.duration! >= 0);
    assert.ok(ev.skyra.duration_ms! >= 0);
    // Verified query parameter was stripped from path and route
    assert.ok(!ev.message.includes('auth=secretToken'));
  });

  it('45. instrumentFetch records failed requests and re-throws original error', async () => {
    const memory = new MemoryTransport();
    const logger = createSkyraBrowserLogger({
      projectId: 'fetch-fail-test',
      serviceName: 'web',
      environment: 'production',
      transport: memory,
    });

    const simulatedError = new Error('Network offline');
    const mockFetch = async () => {
      throw simulatedError;
    };

    await assert.rejects(
      async () => {
        await instrumentFetch(
          logger,
          'https://api.skyra.com/v1/checkout',
          { method: 'POST' },
          mockFetch as unknown as typeof fetch
        );
      },
      /Network offline/
    );

    await logger.flush();
    const ev = memory.getEvents()[0]!;
    assert.equal(ev.event.action, 'http.request.failed');
    assert.equal(ev.event.outcome, 'failure');
    assert.equal(ev.log.level, 'error');
  });

  it('46. Lifecycle handlers install and uninstall cleanly without error in Node/SSR', () => {
    const memory = new MemoryTransport();
    const logger = createSkyraBrowserLogger({
      projectId: 'ssr-lifecycle',
      serviceName: 'web',
      environment: 'production',
      transport: memory,
    });

    assert.doesNotThrow(() => {
      // In Node environment, window/document may be absent; should safely no-op
      const uninstall = installLifecycleHandlers((logger as unknown as { _queue: import('../../src/internal/batch-queue.js').BatchQueue })._queue);
      uninstall();
    });
  });
});
