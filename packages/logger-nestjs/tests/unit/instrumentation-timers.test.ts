import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { createSkyraLogger } from '@skyra/logger-node';
import { measureJob } from '../../dist/instrumentation/job-timer.js';
import { measureDatabase } from '../../dist/instrumentation/database-timer.js';
import { measureOperation } from '../../dist/instrumentation/operation-timer.js';

describe('Instrumentation Helpers (Unit)', () => {
  const logger = createSkyraLogger({
    projectId: 'skyra-erp',
    serviceName: 'erp-api',
    environment: 'test',
    instanceId: 'inst-01',
    level: 'trace',
    transport: { type: 'stdout' },
  });

  describe('measureJob', () => {
    it('1. successfully measures async job, logs completion, and returns result', async () => {
      const result = await measureJob(
        logger,
        'sync-customer-invoices',
        async () => {
          await new Promise((res) => setTimeout(res, 10));
          return { processed: 42 };
        },
        {
          id: 'job-101',
          queue: 'invoices',
          attempt: 1,
          maxAttempts: 3,
          queueDurationMs: 15.2,
        }
      );

      assert.deepEqual(result, { processed: 42 });
    });

    it('2. captures error on failure, logs failed event, and rethrows original exception', async () => {
      const expectedError = new Error('Invoice PDF engine unavailable');

      await assert.rejects(
        async () => {
          await measureJob(
            logger,
            'failing-job',
            async () => {
              throw expectedError;
            },
            { id: 'job-err-01' }
          );
        },
        (err) => err === expectedError
      );
    });
  });

  describe('measureDatabase', () => {
    it('3. measures database query, logs db.query.completed, and preserves return value', async () => {
      const rows = await measureDatabase(
        logger,
        {
          system: 'postgresql',
          name: 'erp_main',
          operation: 'SELECT',
          table: 'invoices',
          statementSanitized: 'SELECT id, total FROM invoices WHERE customer_id = $1',
          queryFingerprint: 'hash-abc-123',
          rowsAffected: 5,
        },
        async () => {
          await new Promise((res) => setTimeout(res, 5));
          return [{ id: 1, total: 100 }, { id: 2, total: 200 }];
        }
      );

      assert.equal(rows.length, 2);
    });

    it('4. captures db failure, logs db.query.failed, and rethrows original error', async () => {
      const dbError = new Error('deadlock detected');

      await assert.rejects(
        async () => {
          await measureDatabase(
            logger,
            {
              system: 'mysql',
              operation: 'UPDATE',
              table: 'accounts',
            },
            async () => {
              throw dbError;
            }
          );
        },
        (err) => err === dbError
      );
    });
  });

  describe('measureOperation', () => {
    it('5. measures generic business operation, preserves outcome and return value', async () => {
      const output = await measureOperation(
        logger,
        'process-payment',
        async () => {
          return { status: 'PAID', amount: 5000 };
        },
        { customerId: 'cust-777' }
      );

      assert.deepEqual(output, { status: 'PAID', amount: 5000 });
    });
  });
});
