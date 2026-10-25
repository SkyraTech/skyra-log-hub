import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { WalJournalService } from '../../src/storage/wal/wal-journal.service.js';
import { ReceiptService } from '../../src/storage/receipt/receipt.service.js';
import { InMemoryReceiptRepository } from '../../src/metadata/repositories/in-memory-receipt.repository.js';
import { GatewayException } from '../../src/common/types/gateway-exception.js';
import { ErrorCode } from '../../src/common/types/error-code.enum.js';

describe('Scenario A & Consistency Reconciliation Tests', () => {
  function createTempWalDir(): string {
    const dir = path.join(os.tmpdir(), `scenario-a-${crypto.randomUUID()}`);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  it('Scenario A: When PostgreSQL receipt write fails, client retry is recognized as duplicate without second WAL append', async () => {
    const walDir = createTempWalDir();
    try {
      const wal = new WalJournalService(undefined, { walDirectory: walDir });
      await wal.initialize();

      // Create a receipt repo that throws on initial save to simulate PostgreSQL outage
      const inMemoryRepo = new InMemoryReceiptRepository();
      let shouldSimulateDbFailure = true;

      const failingRepo = {
        findReceipt: (tenantId: string, projectId: string, batchId: string) =>
          inMemoryRepo.findReceipt(tenantId, projectId, batchId),
        saveReceipt: async (record: any) => {
          if (shouldSimulateDbFailure) {
            throw new Error('PostgreSQL connection timeout: connection refused');
          }
          return inMemoryRepo.saveReceipt(record);
        },
        reconcileReceipts: (records: any) => inMemoryRepo.reconcileReceipts(records),
      };

      const receiptService = new ReceiptService(failingRepo as any, wal);

      const batchId = crypto.randomUUID();
      const tenantId = 'tenant-test-a';
      const projectId = 'proj-test-a';
      const payload = Buffer.from(JSON.stringify([{ event: 'order_completed' }]));
      const digest = `sha256:${crypto.createHash('sha256').update(payload).digest('hex')}`;

      // 1. Initial attempt: Idempotency check returns duplicate: false
      const check1 = await receiptService.checkIdempotency(tenantId, projectId, batchId, digest);
      assert.equal(check1.duplicate, false);

      // 2. Commit batch to WAL
      const { receipt: walReceipt } = await wal.appendBatch(
        {
          batchId,
          tenantId,
          projectId,
          eventCount: 1,
          contentDigestSha256: digest,
        },
        payload,
      );
      const walOffsetAfterFirstCommit = wal.getStatus().currentOffset;

      // 3. PostgreSQL receipt insert fails (simulated crash/outage)
      await assert.rejects(async () => {
        await receiptService.recordReceipt(walReceipt);
      }, /PostgreSQL connection timeout/);

      // Verify that database has NO record of this receipt
      const dbReceipt = await inMemoryRepo.findReceipt(tenantId, projectId, batchId);
      assert.equal(dbReceipt, null);

      // 4. Client retries identical batch: ReceiptService falls back to WAL committed frames
      const check2 = await receiptService.checkIdempotency(tenantId, projectId, batchId, digest);
      assert.equal(check2.duplicate, true, 'Retry must be recognized as duplicate even when DB insert failed');
      assert.ok(check2.receipt);
      assert.equal(check2.receipt!.batchId, batchId);
      assert.equal(check2.receipt!.contentDigest, digest);
      assert.equal(check2.receipt!.journalOffset, walReceipt.journalOffset);

      // 5. CRITICAL: Invariant check - No second WAL append during retry!
      assert.equal(
        wal.getStatus().currentOffset,
        walOffsetAfterFirstCommit,
        'WAL offset must NOT advance on duplicate retry',
      );

      // 6. If client retries with DIFFERENT payload under same batchId:
      const conflictingDigest = 'sha256:0000000000000000000000000000000000000000000000000000000000000000';
      await assert.rejects(
        async () => {
          await receiptService.checkIdempotency(tenantId, projectId, batchId, conflictingDigest);
        },
        (err: GatewayException) => {
          assert.equal(err.code, ErrorCode.IDEMPOTENCY_CONFLICT);
          assert.equal(err.getStatus(), 409);
          return true;
        },
      );

      // 7. Database recovers: startup recovery reconciles the WAL frame into PostgreSQL
      shouldSimulateDbFailure = false;
      const recoveredFrames = wal.readFramesFromOffset('active.wal', 0);
      const restored = await receiptService.reconcileRecoveredFrames(recoveredFrames);
      assert.equal(restored, 1);

      const dbReceiptAfterRecovery = await inMemoryRepo.findReceipt(tenantId, projectId, batchId);
      assert.ok(dbReceiptAfterRecovery);
      assert.equal(dbReceiptAfterRecovery!.batchId, batchId);

      await wal.close();
    } finally {
      fs.rmSync(walDir, { recursive: true, force: true });
    }
  });
});
