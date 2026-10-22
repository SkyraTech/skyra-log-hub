import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WriteQueue, type QueueItem } from '../../dist/internal/write-queue.js';
import type { ResourceLimits } from '../../dist/config.js';
import { DEFAULT_RESOURCE_LIMITS } from '../../dist/config.js';

describe('Reliability: Bounded Write Queue, Backpressure & Emergency Bypass', () => {
  it('1. Bounded queue drops non-critical events on memory overflow', async () => {
    let droppedCount = 0;
    let dropReason = '';

    const tightLimits: ResourceLimits = {
      ...DEFAULT_RESOURCE_LIMITS,
      maxPendingEvents: 5,
      maxQueueMemoryBytes: 500, // Very small memory limit
    };

    const written: QueueItem[] = [];
    const emergencies: QueueItem[] = [];

    // Simulate slow writer
    const queue = new WriteQueue(
      tightLimits,
      async (batch) => {
        // Delay to let queue fill up
        await new Promise((r) => setTimeout(r, 20));
        written.push(...batch);
      },
      (emergencyItem) => {
        emergencies.push(emergencyItem);
      },
      (count, reason) => {
        droppedCount += count;
        dropReason = reason;
      }
    );

    // Enqueue 10 large info events synchronously
    const largeLine = '{"message":"' + 'X'.repeat(150) + '"}\n';
    const acceptedStatuses: boolean[] = [];

    for (let i = 0; i < 10; i++) {
      acceptedStatuses.push(queue.enqueue('info', largeLine));
    }

    // Some events must have been dropped
    assert.ok(droppedCount > 0, 'Expected dropped events on memory overflow');
    assert.ok(dropReason.length > 0);
    assert.ok(acceptedStatuses.includes(false));

    await queue.flush();
    await queue.close();
  });

  it('2. Critical events (error, fatal) evict non-critical events from saturated queue preserving single-writer pipeline', async () => {
    const tightLimits: ResourceLimits = {
      ...DEFAULT_RESOURCE_LIMITS,
      maxPendingEvents: 2,
      maxQueueMemoryBytes: 200,
    };

    const written: QueueItem[] = [];

    const queue = new WriteQueue(
      tightLimits,
      async (batch) => {
        await new Promise((r) => setTimeout(r, 20));
        written.push(...batch);
      }
    );

    // Fill queue to capacity with info logs
    queue.enqueue('info', '{"msg":"filling-1"}\n');
    queue.enqueue('info', '{"msg":"filling-2"}\n');

    // Enqueue an error log while queue is saturated: should evict an info log and succeed
    const errorAccepted = queue.enqueue('error', '{"msg":"CRITICAL_DB_FAILURE"}\n');
    // Enqueue a fatal log while queue is saturated: should evict remaining info log and succeed
    const fatalAccepted = queue.enqueue('fatal', '{"msg":"FATAL_SYSTEM_CRASH"}\n');

    assert.equal(errorAccepted, true);
    assert.equal(fatalAccepted, true);

    await queue.flush();
    await queue.close();

    // Critical events were preserved through priority eviction and written sequentially
    assert.equal(written.length, 2);
    assert.equal(written[0]?.level, 'error');
    assert.equal(written[1]?.level, 'fatal');
  });

  it('3. Repeated flush and close operate deterministically without hanging', async () => {
    const queue = new WriteQueue(
      DEFAULT_RESOURCE_LIMITS,
      async () => {},
      () => {}
    );

    queue.enqueue('info', '{"msg":"1"}\n');

    // Repeated flush calls
    await Promise.all([queue.flush(), queue.flush(), queue.flush()]);

    // Repeated close calls
    await queue.close();
    await queue.close();
    await queue.close();

    const stats = queue.getStats();
    assert.equal(stats.isClosed, true);
    assert.equal(stats.pendingCount, 0);
  });
});
