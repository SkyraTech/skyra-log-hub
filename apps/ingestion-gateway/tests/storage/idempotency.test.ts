import { describe, it, beforeEach, afterEach } from 'node:test';
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

describe('Authoritative Idempotency & Replay Tests (ADR-015)', () => {
  let tempDir: string;
  let receiptRepo: InMemoryReceiptRepository;
  let receiptService: ReceiptService;
  let walService: WalJournalService;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyra-idemp-test-'));
    receiptRepo = new InMemoryReceiptRepository();
    receiptService = new ReceiptService(receiptRepo);
    walService = new WalJournalService(undefined, { walDirectory: tempDir });
    await walService.initialize();
  });

  afterEach(async () => {
    await walService.close();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should acknowledge identical batch retry with duplicate: true and not append duplicate WAL record', async () => {
    const batchId = crypto.randomUUID();
    const tenantId = 'tenant-prod';
    const projectId = 'proj-core';
    const payload = Buffer.from(JSON.stringify([{ msg: 'important event' }]));
    const digest = `sha256:${crypto.createHash('sha256').update(payload).digest('hex')}`;

    // 1. First commit
    const initialCheck = await receiptService.checkIdempotency(tenantId, projectId, batchId, digest);
    assert.equal(initialCheck.duplicate, false);

    const { receipt } = await walService.appendBatch(
      {
        batchId,
        tenantId,
        projectId,
        eventCount: 1,
        contentDigestSha256: digest,
      },
      payload,
    );
    await receiptService.recordReceipt(receipt);

    const offsetAfterFirstCommit = walService.getStatus().currentOffset;

    // 2. Client retry with identical batch_id and identical digest
    const retryCheck = await receiptService.checkIdempotency(tenantId, projectId, batchId, digest);
    assert.equal(retryCheck.duplicate, true);
    assert.ok(retryCheck.receipt);
    assert.equal(retryCheck.receipt?.receiptId, receipt.receiptId);
    assert.equal(retryCheck.receipt?.journalOffset, receipt.journalOffset);
    assert.equal(retryCheck.receipt?.contentDigest, digest);

    // Assert WAL current offset did NOT advance (zero duplicate write)
    assert.equal(walService.getStatus().currentOffset, offsetAfterFirstCommit);
  });

  it('should throw HTTP 409 IDEMPOTENCY_CONFLICT when batch ID is reused with different content', async () => {
    const batchId = crypto.randomUUID();
    const tenantId = 'tenant-prod';
    const projectId = 'proj-core';

    const payloadOriginal = Buffer.from(JSON.stringify([{ msg: 'event original' }]));
    const digestOriginal = `sha256:${crypto.createHash('sha256').update(payloadOriginal).digest('hex')}`;

    const { receipt } = await walService.appendBatch(
      {
        batchId,
        tenantId,
        projectId,
        eventCount: 1,
        contentDigestSha256: digestOriginal,
      },
      payloadOriginal,
    );
    await receiptService.recordReceipt(receipt);

    // Mismatched second payload reusing the same batchId
    const payloadTampered = Buffer.from(JSON.stringify([{ msg: 'event tampered/modified' }]));
    const digestTampered = `sha256:${crypto.createHash('sha256').update(payloadTampered).digest('hex')}`;

    await assert.rejects(
      async () => {
        await receiptService.checkIdempotency(tenantId, projectId, batchId, digestTampered);
      },
      (err: unknown) => {
        assert.ok(err instanceof GatewayException);
        assert.equal(err.code, ErrorCode.IDEMPOTENCY_CONFLICT);
        assert.equal(err.getStatus(), 409);
        return true;
      },
    );
  });

  it('should guarantee multi-tenant isolation when separate tenants submit identical batch IDs', async () => {
    const sharedBatchId = crypto.randomUUID();
    const payload = Buffer.from('event body');
    const digest = `sha256:${crypto.createHash('sha256').update(payload).digest('hex')}`;

    // Tenant A commits
    const { receipt: receiptA } = await walService.appendBatch(
      {
        batchId: sharedBatchId,
        tenantId: 'tenant-aaa',
        projectId: 'project-1',
        eventCount: 1,
        contentDigestSha256: digest,
      },
      payload,
    );
    await receiptService.recordReceipt(receiptA);

    // Tenant B checks the same batch ID: should NOT collide with Tenant A
    const checkB = await receiptService.checkIdempotency('tenant-bbb', 'project-1', sharedBatchId, digest);
    assert.equal(checkB.duplicate, false);

    // Tenant B can commit cleanly
    const { receipt: receiptB } = await walService.appendBatch(
      {
        batchId: sharedBatchId,
        tenantId: 'tenant-bbb',
        projectId: 'project-1',
        eventCount: 1,
        contentDigestSha256: digest,
      },
      payload,
    );
    await receiptService.recordReceipt(receiptB);

    assert.notEqual(receiptA.receiptId, receiptB.receiptId);
  });

  it('should restore missing receipt rows from committed WAL frames during startup reconciliation', async () => {
    const batchId = crypto.randomUUID();
    const payload = Buffer.from(JSON.stringify([{ msg: 'unindexed crash frame' }]));
    const digest = `sha256:${crypto.createHash('sha256').update(payload).digest('hex')}`;

    // Simulate crash after fsync: WAL has frame, but DB insert never ran
    const { frame } = await walService.appendBatch(
      {
        batchId,
        tenantId: 'tenant-crash',
        projectId: 'proj-recon',
        eventCount: 1,
        contentDigestSha256: digest,
      },
      payload,
    );

    // Prior to reconciliation, receiptRepo does not have it
    const beforeRecon = await receiptRepo.findReceipt('tenant-crash', 'proj-recon', batchId);
    assert.equal(beforeRecon, null);

    // Startup recovery reconciliation
    const restored = await receiptService.reconcileRecoveredFrames([frame]);
    assert.equal(restored, 1);

    // After reconciliation, receiptRepo has restored the receipt
    const afterRecon = await receiptRepo.findReceipt('tenant-crash', 'proj-recon', batchId);
    assert.ok(afterRecon);
    assert.equal(afterRecon?.batchId, batchId);
    assert.equal(afterRecon?.contentDigest, digest);
  });

  it('should preserve idempotency across WAL segment rotation', async () => {
    const batchId = crypto.randomUUID();
    const tenantId = 'tenant-rotate';
    const projectId = 'proj-rotate';
    const payload = Buffer.from('payload for rotation test');
    const digest = `sha256:${crypto.createHash('sha256').update(payload).digest('hex')}`;

    const { receipt } = await walService.appendBatch(
      { batchId, tenantId, projectId, eventCount: 1, contentDigestSha256: digest },
      payload,
    );
    await receiptService.recordReceipt(receipt);

    // Force rotation of WAL segment by appending large data
    const largePayload = Buffer.alloc(1024, 0x55);
    const largeDigest = `sha256:${crypto.createHash('sha256').update(largePayload).digest('hex')}`;
    await walService.appendBatch(
      { batchId: crypto.randomUUID(), tenantId, projectId, eventCount: 1, contentDigestSha256: largeDigest },
      largePayload,
    );

    // Retry original batch: must still be recognized as duplicate
    const check = await receiptService.checkIdempotency(tenantId, projectId, batchId, digest);
    assert.equal(check.duplicate, true);
    assert.equal(check.receipt?.receiptId, receipt.receiptId);
  });

  it('should preserve 7-day idempotency after journal compaction (WAL removed, DB receipt retained)', async () => {
    const batchId = crypto.randomUUID();
    const tenantId = 'tenant-compact';
    const projectId = 'proj-compact';
    const payload = Buffer.from('payload for compaction test');
    const digest = `sha256:${crypto.createHash('sha256').update(payload).digest('hex')}`;

    const { receipt } = await walService.appendBatch(
      { batchId, tenantId, projectId, eventCount: 1, contentDigestSha256: digest },
      payload,
    );
    await receiptService.recordReceipt(receipt);

    // Simulate journal compaction: active WAL is closed and wiped/truncated, but PostgreSQL DB retains receipt
    await walService.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.mkdirSync(tempDir, { recursive: true });

    // Open a fresh empty WAL journal without previous frames
    const freshWal = new WalJournalService(undefined, { walDirectory: tempDir });
    await freshWal.initialize();
    const freshReceiptService = new ReceiptService(receiptRepo, freshWal);

    // Retry must be acknowledged as duplicate from persistent receipt repository
    const check = await freshReceiptService.checkIdempotency(tenantId, projectId, batchId, digest);
    assert.equal(check.duplicate, true);
    assert.equal(check.receipt?.receiptId, receipt.receiptId);

    await freshWal.close();
  });

  it('should handle concurrent identical submissions consistently', async () => {
    const batchId = crypto.randomUUID();
    const tenantId = 'tenant-concurrent';
    const projectId = 'proj-concurrent';
    const payload = Buffer.from('concurrent payload');
    const digest = `sha256:${crypto.createHash('sha256').update(payload).digest('hex')}`;

    // Commit initially
    const { receipt } = await walService.appendBatch(
      { batchId, tenantId, projectId, eventCount: 1, contentDigestSha256: digest },
      payload,
    );
    await receiptService.recordReceipt(receipt);

    // Run 10 concurrent duplicate checks
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        receiptService.checkIdempotency(tenantId, projectId, batchId, digest),
      ),
    );

    for (const r of results) {
      assert.equal(r.duplicate, true);
      assert.equal(r.receipt?.receiptId, receipt.receiptId);
    }
  });

  it('should enforce 7-day deduplication boundary and handle expiration', async () => {
    const batchId = crypto.randomUUID();
    const tenantId = 'tenant-horizon';
    const projectId = 'proj-horizon';
    const payload = Buffer.from('horizon payload');
    const digest = `sha256:${crypto.createHash('sha256').update(payload).digest('hex')}`;

    const baseTime = new Date('2026-10-24T00:00:00.000Z');

    const { receipt } = await walService.appendBatch(
      { batchId, tenantId, projectId, eventCount: 1, contentDigestSha256: digest },
      payload,
    );
    // Explicitly record with baseTime
    const record = {
      id: receipt.receiptId,
      tenantId,
      projectId,
      batchId,
      contentDigest: digest,
      journalSegment: receipt.journalSegment,
      journalOffset: BigInt(receipt.journalOffset),
      acceptedCount: 1,
      committedAt: baseTime,
      expiresAt: new Date(baseTime.getTime() + 7 * 24 * 60 * 60 * 1000), // +7 days
    };
    await receiptRepo.saveReceipt(record);

    // 1. Day 6 (Within horizon): Recognized as duplicate
    const day6 = new Date(baseTime.getTime() + 6 * 24 * 60 * 60 * 1000);
    const checkDay6 = await receiptService.checkIdempotency(tenantId, projectId, batchId, digest, day6);
    assert.equal(checkDay6.duplicate, true);

    // 2. Day 7 minus 1 second (Exact boundary): Recognized as duplicate
    const boundaryTime = new Date(record.expiresAt.getTime() - 1000);
    const checkBoundary = await receiptService.checkIdempotency(tenantId, projectId, batchId, digest, boundaryTime);
    assert.equal(checkBoundary.duplicate, true);

    // 3. Day 7 plus 1 second (Expired): Recognized as expired (duplicate: false)
    const afterExpiry = new Date(record.expiresAt.getTime() + 1000);
    const checkExpired = await receiptService.checkIdempotency(tenantId, projectId, batchId, digest, afterExpiry);
    assert.equal(checkExpired.duplicate, false, 'Expired receipt must no longer be treated as an active duplicate');

    // 4. Pruning removes expired receipts from storage
    const prunedCount = await receiptRepo.pruneExpiredReceipts(afterExpiry);
    assert.equal(prunedCount, 1);
    const postPrune = await receiptRepo.findReceipt(tenantId, projectId, batchId);
    assert.equal(postPrune, null);
  });
});
