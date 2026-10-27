import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { QueryResourceGovernorService } from '../../src/modules/query-execution/infrastructure/duckdb/query-resource-governor.service.js';
import {
  QueryCancelledException,
  QueryTimeoutException,
  QueryBudgetExceededException,
} from '../../src/common/errors/query.errors.js';

describe('Multi-Tenant Fairness, Cancellation & Resource Governance (LOGHUB-QUERY-007)', () => {
  it('TFC-1: Tenant concurrency capping prevents single tenant from starving competing tenants', async () => {
    const governor = new QueryResourceGovernorService();
    const executionOrder: string[] = [];

    // Tenant A submits 4 queries (each taking 60ms)
    // Tenant B submits 1 query (taking 20ms)
    const promises: Promise<unknown>[] = [];

    for (let i = 1; i <= 4; i++) {
      promises.push(
        governor.schedule(
          `tenant-a-q${i}`,
          'tenant-a',
          5000,
          async () => {
            await new Promise((r) => setTimeout(r, 60));
            executionOrder.push(`tenant-a-q${i}`);
            return `a-${i}`;
          },
        ),
      );
    }

    // Immediately after, Tenant B submits a query
    promises.push(
      governor.schedule(
        'tenant-b-q1',
        'tenant-b',
        5000,
        async () => {
          await new Promise((r) => setTimeout(r, 20));
          executionOrder.push('tenant-b-q1');
          return 'b-1';
        },
      ),
    );

    await Promise.all(promises);

    // Tenant B must execute concurrently with Tenant A's first batch because maxConcurrentPerTenant is 2
    // and total concurrent slots is 4, so Tenant B is not starved behind all 4 of Tenant A's tasks!
    const tenantBIndex = executionOrder.indexOf('tenant-b-q1');
    assert.ok(tenantBIndex !== -1);
    assert.ok(
      tenantBIndex < 3,
      `Tenant B must complete ahead of saturated Tenant A queue (actual index: ${tenantBIndex})`,
    );
  });

  it('TFC-2: Query cancellation via AbortSignal in waiting queue immediately cleans up without slot leak', async () => {
    const governor = new QueryResourceGovernorService();

    // Fill all 4 active execution slots with 100ms tasks
    for (let i = 1; i <= 4; i++) {
      governor.schedule(
        `blocker-q${i}`,
        `tenant-${i}`,
        5000,
        async () => {
          await new Promise((r) => setTimeout(r, 100));
        },
      );
    }

    const abortController = new AbortController();

    // Submit a queued task with abort signal
    const queuedTaskPromise = governor.schedule(
      'queued-cancel-q',
      'tenant-victim',
      5000,
      async () => 'should not run',
      abortController.signal,
    );

    assert.equal(governor.getQueueLength(), 1);

    // Trigger abort while task is in queue
    abortController.abort();

    await assert.rejects(queuedTaskPromise, (err: unknown) => {
      assert.ok(err instanceof QueryCancelledException);
      assert.ok((err as Error).message.includes('aborted'));
      return true;
    });

    // Queue depth must be back to 0 immediately
    assert.equal(governor.getQueueLength(), 0);
  });

  it('TFC-3: Timeout budget triggers execution interrupt and frees execution slot for next query', async () => {
    const governor = new QueryResourceGovernorService();
    let abortInvoked = false;

    const timeoutPromise = governor.schedule(
      'timeout-q',
      'tenant-timeout',
      50, // 50ms timeout
      async (onAbort) => {
        onAbort(() => {
          abortInvoked = true;
        });
        await new Promise((r) => setTimeout(r, 500));
        return 'too late';
      },
    );

    await assert.rejects(timeoutPromise, (err: unknown) => {
      assert.ok(err instanceof QueryTimeoutException);
      return true;
    });

    assert.equal(abortInvoked, true, 'onAbort callback must be triggered on timeout');

    // Verify slot was released: a new query executes successfully
    const successRes = await governor.schedule('subsequent-q', 'tenant-timeout', 1000, async () => 'success');
    assert.equal(successRes, 'success');
  });

  it('TFC-4: Queue capacity saturation rejects excess queries with QueryBudgetExceededException (HTTP 429)', async () => {
    const governor = new QueryResourceGovernorService();

    // Fill 4 active slots + 16 queue slots = 20 total
    const promises: Promise<unknown>[] = [];
    for (let i = 1; i <= 20; i++) {
      promises.push(
        governor.schedule(`load-q-${i}`, `tenant-${i % 5}`, 5000, async () => {
          await new Promise((r) => setTimeout(r, 150));
        }),
      );
    }

    assert.equal(governor.getQueueLength(), 16);

    // 21st query must be rejected with queue capacity limit
    await assert.rejects(
      governor.schedule('overflow-q', 'tenant-overflow', 5000, async () => 'overflow'),
      (err: unknown) => {
        assert.ok(err instanceof QueryBudgetExceededException);
        assert.ok((err as Error).message.includes('maximum capacity'));
        return true;
      },
    );

    await Promise.all(promises);
  });
});
