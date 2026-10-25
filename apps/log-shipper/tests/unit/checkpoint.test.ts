import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { CheckpointManager } from '../../src/checkpoint.js';
import type { PendingBatch, GatewayReceipt } from '../../src/types.js';

describe('CheckpointManager Unit Tests', () => {
  let tempDir: string;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyra-ckpt-test-'));
  });

  after(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });

  it('atomically persists pending batch and recovers state on reload', () => {
    const manager = new CheckpointManager(tempDir);
    const locator = 'skyra-tech/production/api-service/inst-01/2026-10-24.part-0000.jsonl';
    const fullPath = path.join(tempDir, 'dummy.jsonl');

    const record = manager.getRecord(locator, fullPath);
    assert.equal(record.lastAckOffset, 0);
    assert.equal(record.pendingBatch, null);

    const pending: PendingBatch = {
      batchId: '987e6543-e21b-42d3-a456-426614174000',
      startOffset: 0,
      endOffset: 512,
      contentDigestSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      eventCount: 5,
      createdAt: new Date().toISOString(),
      events: [] as any,
    };

    manager.setPendingBatch(locator, pending);

    // Simulate process crash and restart: create a new manager instance reading from disk
    const restartedManager = new CheckpointManager(tempDir);
    const recovered = restartedManager.getRecord(locator, fullPath);

    assert.ok(recovered.pendingBatch);
    assert.equal(recovered.pendingBatch.batchId, pending.batchId);
    assert.equal(recovered.pendingBatch.endOffset, 512);
    assert.equal(recovered.lastAckOffset, 0); // Not acknowledged yet!

    // Now acknowledge the batch
    const receipt: GatewayReceipt = {
      receipt_id: 'rcpt_test_123',
      journal_segment: 'active.wal',
      journal_offset: 1024,
      committed_at: new Date().toISOString(),
      content_digest: 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    };

    restartedManager.acknowledgeBatch(locator, receipt);

    const afterAck = restartedManager.getRecord(locator, fullPath);
    assert.equal(afterAck.lastAckOffset, 512);
    assert.equal(afterAck.pendingBatch, null);
    assert.equal(afterAck.lastReceipt?.receipt_id, 'rcpt_test_123');
  });

  it('records delivery failure and increments delivery attempt count', () => {
    const manager = new CheckpointManager(tempDir);
    const locator = 'skyra-tech/production/api-service/inst-02/2026-10-24.part-0000.jsonl';
    const fullPath = path.join(tempDir, 'dummy2.jsonl');

    manager.getRecord(locator, fullPath);
    manager.recordFailure(locator, 'Gateway 503 unavailable', 503);
    manager.recordFailure(locator, 'Connection reset', undefined);

    const record = manager.getRecord(locator, fullPath);
    assert.equal(record.deliveryAttempts, 2);
    assert.equal(record.lastError, 'Connection reset');
  });
});
