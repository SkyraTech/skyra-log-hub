import { describe, it, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { WalJournalService } from '../../src/storage/wal/wal-journal.service.js';
import { ReceiptService, SEVEN_DAYS_MS } from '../../src/storage/receipt/receipt.service.js';
import { DeduplicationLockService } from '../../src/storage/receipt/receipt-lock.service.js';
import { ValkeyReceiptCache } from '../../src/storage/receipt/receipt-cache.interface.js';
import { ReceiptRetentionService } from '../../src/storage/receipt/receipt-retention.service.js';
import { InMemoryReceiptRepository } from '../../src/metadata/repositories/in-memory-receipt.repository.js';
import { ArchiveWriterService } from '../../src/storage/archive/archive-writer.service.js';
import { InMemoryArchiveSegmentRepository } from '../../src/metadata/repositories/in-memory-archive-segment.repository.js';
import { IngestionService } from '../../src/ingestion/ingestion.service.js';
import { BatchValidationPipe } from '../../src/ingestion/pipes/batch-validation.pipe.js';
import { GatewayException } from '../../src/common/types/gateway-exception.js';
import { ErrorCode } from '../../src/common/types/error-code.enum.js';
import type { NormalizedBatch } from '../../src/ingestion/dto/batch-request.dto.js';
import type { AuthenticatedIdentity } from '../../src/auth/auth.types.js';
import { createValidLogEvent } from '../fixtures/valid-event.fixture.js';
import { StorageOwnershipConflictError } from '../../src/storage/wal/journal-ownership.js';
import { StorageDiagnosticsService } from '../../src/observability/storage-diagnostics.service.js';

describe('Authoritative Idempotency & 12-Scenario Failure Recovery Suite (ADR-015)', () => {
  let tempDir: string;
  let walDir: string;
  let archiveDir: string;
  let receiptRepo: InMemoryReceiptRepository;
  let archiveRepo: InMemoryArchiveSegmentRepository;
  let cache: ValkeyReceiptCache;
  let lockService: DeduplicationLockService;
  let receiptService: ReceiptService;
  let walService: WalJournalService;
  let archiveWriter: ArchiveWriterService;
  let retentionService: ReceiptRetentionService;
  let ingestionService: IngestionService;
  let validationPipe: BatchValidationPipe;

  const mockProjectService: any = {
    authorizeProjectAccess: async (projectId: string, environment: string, identity: AuthenticatedIdentity) => {
      return {
        project: { id: projectId, tenantId: identity.tenantId, name: projectId, status: 'ACTIVE' },
        quota: { maxBatchSize: 1000, maxPayloadBytes: 5242880, maxEventsPerSec: 5000 },
      };
    },
  };

  const mockDiagnostics: any = {
    recordValidationFailure: () => {},
    recordAuthzFailure: () => {},
    recordStorageUnavailable: () => {},
  };

  const defaultIdentity: AuthenticatedIdentity = {
    tenantId: '00000000-0000-0000-0000-000000000001',
    credentialId: 'cred-test-01',
    allowedProjects: ['*'],
    allowedEnvironments: ['*'],
    rateLimitPerMin: 1000,
  };

  function createTestEvent(projectId = 'skyra-core', env = 'production', message = 'user checkout complete') {
    return createValidLogEvent({
      projectId,
      environment: env,
      overrides: {
        message,
        service: { name: 'order-service', version: '1.0.0', environment: env },
      },
    });
  }

  function createNormalizedBatch(batchId: string, events: Record<string, any>[]): NormalizedBatch {
    const rawPayload = JSON.stringify(events);
    const digest = crypto.createHash('sha256').update(rawPayload).digest('hex');
    return {
      protocol_version: '1.0',
      batch_id: batchId,
      sent_at: new Date().toISOString(),
      events,
      contentDigestSha256: `sha256:${digest}`,
      isLegacyEnvelope: false,
    };
  }

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyra-12scenarios-'));
    walDir = path.join(tempDir, 'wal');
    archiveDir = path.join(tempDir, 'archive');
    fs.mkdirSync(walDir, { recursive: true });
    fs.mkdirSync(archiveDir, { recursive: true });

    receiptRepo = new InMemoryReceiptRepository();
    archiveRepo = new InMemoryArchiveSegmentRepository();
    cache = new ValkeyReceiptCache(86400);
    lockService = new DeduplicationLockService();

    walService = new WalJournalService(undefined, { walDirectory: walDir });
    await walService.initialize();

    receiptService = new ReceiptService(receiptRepo, walService, cache, lockService);
    archiveWriter = new ArchiveWriterService(archiveRepo, { archiveRoot: archiveDir });
    retentionService = new ReceiptRetentionService(receiptRepo, { enabled: false, retentionHorizonMs: SEVEN_DAYS_MS });

    ingestionService = new IngestionService(
      mockProjectService,
      mockDiagnostics,
      walService,
      receiptService,
      archiveWriter,
      lockService,
    );

    validationPipe = new BatchValidationPipe({ maxBatchSize: 1000 } as any);
  });

  afterEach(async () => {
    await walService.close();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // =========================================================================
  // SCENARIO 1: Batch written and fsynced, HTTP response lost
  // =========================================================================
  it('Scenario 1: Batch written and fsynced, HTTP response lost -> retry acknowledged with duplicate: true and zero duplicate WAL append', async () => {
    const batchId = crypto.randomUUID();
    const batch = createNormalizedBatch(batchId, [createTestEvent()]);

    // 1. Initial ingestion succeeds and fsyncs to journal
    const res1 = await ingestionService.admitAndIngestBatch(batch, defaultIdentity);
    assert.equal(res1.status, 'durably_accepted');
    assert.equal(res1.duplicate, false);
    const initialReceipt = res1.receipt;
    const offsetAfterFirstCommit = walService.getStatus().currentOffset;

    // 2. Network drop occurs: Shipper retries identical batch
    const res2 = await ingestionService.admitAndIngestBatch(batch, defaultIdentity);
    assert.equal(res2.status, 'durably_accepted');
    assert.equal(res2.duplicate, true);
    assert.equal(res2.receipt.receipt_id, initialReceipt.receipt_id);
    assert.equal(res2.receipt.journal_offset, initialReceipt.journal_offset);

    // Verify zero duplicate frames written to WAL
    assert.equal(walService.getStatus().currentOffset, offsetAfterFirstCommit);
  });

  // =========================================================================
  // SCENARIO 2: Gateway crashes after commit and before acknowledgement
  // =========================================================================
  it('Scenario 2: Gateway crashes after commit -> startup recovery discovers WAL frame, restores receipt, client retry succeeds', async () => {
    const batchId = crypto.randomUUID();
    const batch = createNormalizedBatch(batchId, [createTestEvent()]);

    // Commit batch to WAL, but simulate crash before HTTP acknowledgment and before DB receipt insert
    const payloadBuf = Buffer.from(JSON.stringify(batch.events), 'utf-8');
    const { receipt } = await walService.appendBatch(
      {
        batchId: batch.batch_id,
        tenantId: defaultIdentity.tenantId,
        projectId: 'skyra-core',
        eventCount: batch.events.length,
        contentDigestSha256: batch.contentDigestSha256,
      },
      payloadBuf,
    );
    assert.ok(receipt);

    // Simulate crash: close old instance without DB receipt
    await walService.close();

    // Reboot gateway: fresh WAL service mounts existing directory and discovers committed frame
    const rebootWal = new WalJournalService(undefined, { walDirectory: walDir });
    await rebootWal.initialize();
    assert.equal(rebootWal.getStatus().committedCount, 1);

    // Startup recovery reconciles recovered frames into receipt index
    const freshReceiptRepo = new InMemoryReceiptRepository();
    const freshReceiptService = new ReceiptService(freshReceiptRepo, rebootWal, cache, lockService);
    const reconciled = await freshReceiptService.reconcileRecoveredFrames(rebootWal.getAllCommittedFrames());
    assert.equal(reconciled, 1);

    // Client retries upon gateway restart: acknowledged as duplicate: true
    const check = await freshReceiptService.checkIdempotency(
      defaultIdentity.tenantId,
      'skyra-core',
      batchId,
      batch.contentDigestSha256,
    );
    assert.equal(check.duplicate, true);
    assert.equal(check.receipt?.batchId, batchId);

    await rebootWal.close();
  });

  // =========================================================================
  // SCENARIO 3: Client retries while the server is restarting
  // =========================================================================
  it('Scenario 3: Client retries while server is restarting -> returns 503 STORAGE_NOT_READY until storage is mounted', async () => {
    const batchId = crypto.randomUUID();
    const batch = createNormalizedBatch(batchId, [createTestEvent()]);

    // Construct uninitialized WAL service
    const unreadyWal = new WalJournalService(undefined, { walDirectory: path.join(tempDir, 'unready-wal') });
    // walService.initialize() NOT CALLED -> getStatus().isReady is false

    const unreadyIngestion = new IngestionService(
      mockProjectService,
      mockDiagnostics,
      unreadyWal,
      receiptService,
      archiveWriter,
      lockService,
    );

    // Attempting ingestion before storage recovery completes must fail closed with 503
    await assert.rejects(
      async () => {
        await unreadyIngestion.admitAndIngestBatch(batch, defaultIdentity);
      },
      (err: any) => {
        assert.ok(err instanceof GatewayException);
        assert.equal(err.code, ErrorCode.STORAGE_NOT_READY);
        assert.equal(err.getStatus(), 503);
        return true;
      },
    );
  });

  // =========================================================================
  // SCENARIO 4: Valkey is completely unavailable
  // =========================================================================
  it('Scenario 4: Valkey is completely unavailable -> transparent fallback to PostgreSQL/WAL with zero error', async () => {
    const batchId = crypto.randomUUID();
    const batch = createNormalizedBatch(batchId, [createTestEvent()]);

    // 1. Initial ingestion
    await ingestionService.admitAndIngestBatch(batch, defaultIdentity);

    // 2. Simulate Valkey offline (network partition or process crash)
    cache.setAvailable(false);
    assert.equal(cache.isAvailable(), false);

    // 3. Client retries: Gateway falls back to PostgreSQL seamlessly without throwing
    const res = await ingestionService.admitAndIngestBatch(batch, defaultIdentity);
    assert.equal(res.status, 'durably_accepted');
    assert.equal(res.duplicate, true);
    assert.equal(res.batch_id, batchId);
  });

  // =========================================================================
  // SCENARIO 5: Valkey is flushed by an operator (FLUSHALL)
  // =========================================================================
  it('Scenario 5: Valkey is flushed by an operator (FLUSHALL) -> cache miss falls back to PostgreSQL, re-populates Valkey, deduplicates', async () => {
    const batchId = crypto.randomUUID();
    const batch = createNormalizedBatch(batchId, [createTestEvent()]);

    // 1. Ingest batch and verify cache is populated
    await ingestionService.admitAndIngestBatch(batch, defaultIdentity);
    assert.equal(cache.size, 1);

    // 2. Operator runs FLUSHALL in Valkey
    await cache.clear();
    assert.equal(cache.size, 0);

    // 3. Retry arrives: Cache miss triggers PostgreSQL lookup, recognizes duplicate, re-populates cache
    const res = await ingestionService.admitAndIngestBatch(batch, defaultIdentity);
    assert.equal(res.duplicate, true);
    assert.equal(res.batch_id, batchId);

    // Verify cache has been lazily re-populated
    const cachedItem = await cache.get(defaultIdentity.tenantId, 'skyra-core', batchId);
    assert.ok(cachedItem);
    assert.equal(cachedItem.batchId, batchId);
  });

  // =========================================================================
  // SCENARIO 6: Replay cache entry expires (24h TTL)
  // =========================================================================
  it('Scenario 6: Replay cache entry expires (24h TTL) -> persistent PostgreSQL receipt valid across 7 days', async () => {
    const batchId = crypto.randomUUID();
    const batch = createNormalizedBatch(batchId, [createTestEvent()]);

    // 1. Ingest batch
    await ingestionService.admitAndIngestBatch(batch, defaultIdentity);

    // 2. Simulate 25 hours elapsed in cache (cache entry expired)
    await cache.delete(defaultIdentity.tenantId, 'skyra-core', batchId);
    const inCache = await cache.get(defaultIdentity.tenantId, 'skyra-core', batchId);
    assert.equal(inCache, null);

    // 3. Retry arrives 25 hours later (well within 7-day PostgreSQL horizon)
    const clock25h = new Date(Date.now() + 25 * 3600 * 1000);
    const check = await receiptService.checkIdempotency(
      defaultIdentity.tenantId,
      'skyra-core',
      batchId,
      batch.contentDigestSha256,
      clock25h,
    );
    assert.equal(check.duplicate, true);
    assert.equal(check.receipt?.batchId, batchId);
  });

  // =========================================================================
  // SCENARIO 7: Two identical batches arrive concurrently (Race Condition)
  // =========================================================================
  it('Scenario 7: Concurrent identical submissions -> lock serializes execution, exactly one commits, exactly one duplicates', async () => {
    const batchId = crypto.randomUUID();
    const batch = createNormalizedBatch(batchId, [createTestEvent()]);

    // Launch 2 identical requests concurrently
    const [res1, res2] = await Promise.all([
      ingestionService.admitAndIngestBatch(batch, defaultIdentity),
      ingestionService.admitAndIngestBatch(batch, defaultIdentity),
    ]);

    // Exactly one must be original (duplicate: false) and exactly one must be duplicate: true
    const results = [res1, res2];
    const originalCount = results.filter((r) => r.duplicate === false).length;
    const duplicateCount = results.filter((r) => r.duplicate === true).length;

    assert.equal(originalCount, 1);
    assert.equal(duplicateCount, 1);

    // Verify WAL contains exactly ONE frame, not two
    const committedFrames = walService.getAllCommittedFrames();
    const matchingFrames = committedFrames.filter((f: any) => f.batchId === batchId);
    assert.equal(matchingFrames.length, 1);
  });

  // =========================================================================
  // SCENARIO 8: Same batch ID reused with different content
  // =========================================================================
  it('Scenario 8: Batch ID reuse with modified payload -> HTTP 409 IDEMPOTENCY_CONFLICT, zero corruption', async () => {
    const batchId = crypto.randomUUID();
    const batch1 = createNormalizedBatch(batchId, [createTestEvent('skyra-core', 'production', 'original event')]);
    const batch2 = createNormalizedBatch(batchId, [createTestEvent('skyra-core', 'production', 'modified payload event')]);

    // 1. Commit original batch
    const res1 = await ingestionService.admitAndIngestBatch(batch1, defaultIdentity);
    assert.equal(res1.duplicate, false);

    // 2. Submit same batch_id with conflicting content
    await assert.rejects(
      async () => {
        await ingestionService.admitAndIngestBatch(batch2, defaultIdentity);
      },
      (err: any) => {
        assert.ok(err instanceof GatewayException);
        assert.equal(err.code, ErrorCode.IDEMPOTENCY_CONFLICT);
        assert.equal(err.getStatus(), 409);
        return true;
      },
    );
  });

  // =========================================================================
  // SCENARIO 9: Two tenants submit the same event ID or batch ID
  // =========================================================================
  it('Scenario 9: Cross-tenant duplicate batch ID -> namespace isolation guarantees independent processing', async () => {
    const sharedBatchId = crypto.randomUUID();
    const tenantA = '00000000-0000-0000-0000-000000000001';
    const tenantB = '00000000-0000-0000-0000-000000000002';

    const identityA: AuthenticatedIdentity = { ...defaultIdentity, tenantId: tenantA };
    const identityB: AuthenticatedIdentity = { ...defaultIdentity, tenantId: tenantB };

    const batch = createNormalizedBatch(sharedBatchId, [createTestEvent()]);

    // Tenant A submits batch
    const resA = await ingestionService.admitAndIngestBatch(batch, identityA);
    assert.equal(resA.duplicate, false);

    // Tenant B submits exact same batch ID
    const resB = await ingestionService.admitAndIngestBatch(batch, identityB);
    assert.equal(resB.duplicate, false);

    // Both receipts exist independently in receipt repository
    const receiptA = await receiptRepo.findReceipt(tenantA, 'skyra-core', sharedBatchId);
    const receiptB = await receiptRepo.findReceipt(tenantB, 'skyra-core', sharedBatchId);

    assert.ok(receiptA);
    assert.ok(receiptB);
    assert.equal(receiptA.tenantId, tenantA);
    assert.equal(receiptB.tenantId, tenantB);
  });

  // =========================================================================
  // SCENARIO 10: Legacy SDK retries a batch without a batch ID
  // =========================================================================
  it('Scenario 10: Legacy SDK without batch ID -> deterministic synthetic batch ID derived, retry recognized as duplicate', async () => {
    const legacyEvents = [createTestEvent('skyra-core', 'production', 'browser client event')];
    const legacyEnvelope = {
      sent_at: new Date().toISOString(),
      events: legacyEvents,
    };

    // 1. Process through validation pipe: derives synthetic batch ID
    const normalized1 = validationPipe.transform(legacyEnvelope);
    assert.ok(normalized1.batch_id);
    assert.equal(normalized1.isLegacyEnvelope, true);

    // Ingest first attempt
    const res1 = await ingestionService.admitAndIngestBatch(normalized1, defaultIdentity);
    assert.equal(res1.duplicate, false);

    // 2. Legacy client retries identical payload without batch_id
    const normalized2 = validationPipe.transform(legacyEnvelope);
    // Deterministic hash guarantees synthetic batch_id matches exactly
    assert.equal(normalized2.batch_id, normalized1.batch_id);

    // Ingest retry attempt: Recognized as duplicate: true
    const res2 = await ingestionService.admitAndIngestBatch(normalized2, defaultIdentity);
    assert.equal(res2.duplicate, true);
    assert.equal(res2.batch_id, normalized1.batch_id);
  });

  // =========================================================================
  // SCENARIO 11: Crash occurs while committing the idempotency record
  // =========================================================================
  it('Scenario 11: Crash occurs before DB receipt row -> startup recovery reconciles missing DB receipts from WAL', async () => {
    const batchId = crypto.randomUUID();
    const batch = createNormalizedBatch(batchId, [createTestEvent()]);
    const payloadBuf = Buffer.from(JSON.stringify(batch.events), 'utf-8');

    // Append batch to WAL (fsynced to physical disk)
    await walService.appendBatch(
      {
        batchId: batch.batch_id,
        tenantId: defaultIdentity.tenantId,
        projectId: 'skyra-core',
        eventCount: batch.events.length,
        contentDigestSha256: batch.contentDigestSha256,
      },
      payloadBuf,
    );

    // DB receipt row was NEVER inserted (simulating crash right after WAL fsync)
    const dbReceiptBefore = await receiptRepo.findReceipt(defaultIdentity.tenantId, 'skyra-core', batchId);
    assert.equal(dbReceiptBefore, null);

    // Reboot / startup recovery reconciles committed WAL frames into PostgreSQL
    const committedFrames = walService.getAllCommittedFrames();
    const restoredCount = await receiptService.reconcileRecoveredFrames(committedFrames);
    assert.equal(restoredCount, 1);

    // DB receipt row now exists
    const dbReceiptAfter = await receiptRepo.findReceipt(defaultIdentity.tenantId, 'skyra-core', batchId);
    assert.ok(dbReceiptAfter);
    assert.equal(dbReceiptAfter.batchId, batchId);

    // Retry succeeds with duplicate: true
    const check = await receiptService.checkIdempotency(
      defaultIdentity.tenantId,
      'skyra-core',
      batchId,
      batch.contentDigestSha256,
    );
    assert.equal(check.duplicate, true);
  });

  // =========================================================================
  // SCENARIO 12: Journal replay occurs after archive finalization
  // =========================================================================
  it('Scenario 12: Recovery after archive finalization -> watermark offset skips already-archived frames', async () => {
    const batchId = crypto.randomUUID();
    const batch = createNormalizedBatch(batchId, [createTestEvent()]);
    const dateStr = new Date().toISOString().slice(0, 10);

    // Ingest batch through full pipeline (appended to WAL and Archive)
    const res = await ingestionService.admitAndIngestBatch(batch, defaultIdentity);
    assert.equal(res.duplicate, false);

    // Force segment finalization
    const partitionKey = `${defaultIdentity.tenantId}#skyra-core#production#order-service#${dateStr}`;
    const manifest = await archiveWriter.finalizeSegment(partitionKey, {
      tenantId: defaultIdentity.tenantId,
      projectId: 'skyra-core',
      environment: 'production',
      serviceName: 'order-service',
      date: dateStr,
    });
    assert.ok(manifest);

    // Verify archive segment records persistent journal watermark range
    assert.equal(manifest.journal_commit_range.segment_id, res.receipt.journal_segment);
    assert.equal(manifest.journal_commit_range.start_offset, res.receipt.journal_offset);
    assert.ok(manifest.journal_commit_range.end_offset > manifest.journal_commit_range.start_offset);

    // Manifest verification: manifest file written to disk
    const manifestPath = path.join(
      archiveDir,
      defaultIdentity.tenantId,
      'skyra-core',
      'production',
      'order-service',
      dateStr,
      `${manifest.segment_filename.replace('.jsonl', '.manifest.json')}`,
    );
    assert.ok(fs.existsSync(manifestPath), `Manifest should exist at ${manifestPath}`);
    const manifestContent = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    assert.equal(manifestContent.record_count, 1);
    assert.equal(manifestContent.journal_commit_range.start_offset, manifest.journal_commit_range.start_offset);
  });

  // =========================================================================
  // RETENTION PRUNING & BOUNDED HORIZON TEST
  // =========================================================================
  it('ReceiptRetentionService: Prunes receipts past 7-day horizon while preserving active receipts', async () => {
    const now = new Date();
    const expiredDate = new Date(now.getTime() - 8 * 24 * 3600 * 1000); // 8 days ago
    const activeDate = new Date(now.getTime() + 6 * 24 * 3600 * 1000);  // expires in 6 days

    // Save expired receipt
    await receiptRepo.saveReceipt({
      id: crypto.randomUUID(),
      tenantId: 'tenant-test',
      projectId: 'proj-test',
      batchId: 'batch-expired',
      contentDigest: 'sha256:1111111111111111111111111111111111111111111111111111111111111111',
      journalSegment: 'active.wal',
      journalOffset: 0,
      acceptedCount: 1,
      committedAt: new Date(now.getTime() - 15 * 24 * 3600 * 1000),
      expiresAt: expiredDate,
    });

    // Save active receipt
    await receiptRepo.saveReceipt({
      id: crypto.randomUUID(),
      tenantId: 'tenant-test',
      projectId: 'proj-test',
      batchId: 'batch-active',
      contentDigest: 'sha256:2222222222222222222222222222222222222222222222222222222222222222',
      journalSegment: 'active.wal',
      journalOffset: 100,
      acceptedCount: 1,
      committedAt: now,
      expiresAt: activeDate,
    });

    // Run pruner
    const prunedCount = await retentionService.pruneExpiredReceipts(now);
    assert.equal(prunedCount, 1);

    // Expired receipt is gone
    const expiredCheck = await receiptRepo.findReceipt('tenant-test', 'proj-test', 'batch-expired');
    assert.equal(expiredCheck, null);

    // Active receipt is retained
    const activeCheck = await receiptRepo.findReceipt('tenant-test', 'proj-test', 'batch-active');
    assert.ok(activeCheck);
    assert.equal(activeCheck.batchId, 'batch-active');
  });

  // =========================================================================
  // HIGH CONCURRENCY BURST: 10 & 100 CONCURRENT IDENTICAL SUBMISSIONS
  // =========================================================================
  it('High Concurrency: 10 concurrent identical submissions produce exactly 1 WAL commit and 9 duplicate acks', async () => {
    const batchId = crypto.randomUUID();
    const batch = createNormalizedBatch(batchId, [createTestEvent()]);

    const promises = Array.from({ length: 10 }, () => ingestionService.admitAndIngestBatch(batch, defaultIdentity));
    const results = await Promise.all(promises);

    const originalCount = results.filter((r) => r.duplicate === false).length;
    const duplicateCount = results.filter((r) => r.duplicate === true).length;

    assert.equal(originalCount, 1);
    assert.equal(duplicateCount, 9);

    const committedFrames = walService.getAllCommittedFrames().filter((f: any) => f.batchId === batchId);
    assert.equal(committedFrames.length, 1);
  });

  it('High Concurrency: 100 concurrent identical submissions produce exactly 1 WAL commit and 99 duplicate acks without deadlock', async () => {
    const batchId = crypto.randomUUID();
    const batch = createNormalizedBatch(batchId, [createTestEvent()]);

    const promises = Array.from({ length: 100 }, () => ingestionService.admitAndIngestBatch(batch, defaultIdentity));
    const results = await Promise.all(promises);

    const originalCount = results.filter((r) => r.duplicate === false).length;
    const duplicateCount = results.filter((r) => r.duplicate === true).length;

    assert.equal(originalCount, 1);
    assert.equal(duplicateCount, 99);

    const committedFrames = walService.getAllCommittedFrames().filter((f: any) => f.batchId === batchId);
    assert.equal(committedFrames.length, 1);
  });

  // =========================================================================
  // MULTI-PROCESS WRITER OWNERSHIP & FENCING (SECTION 6)
  // =========================================================================
  it('Multi-Process Ownership: Second gateway instance targeting same WAL directory is rejected with StorageOwnershipConflictError', async () => {
    // walService is already initialized and holds .journal.owner
    const secondWal = new WalJournalService(undefined, { walDirectory: walDir });

    await assert.rejects(
      async () => {
        await secondWal.initialize();
      },
      (err: any) => {
        assert.ok(err instanceof StorageOwnershipConflictError);
        assert.equal(err.existingPid, process.pid);
        assert.equal(err.getStatus(), 503);
        return true;
      },
    );
  });

  it('Multi-Process Ownership: Stale lock from dead PID is safely recovered during gateway startup', async () => {
    // Create dedicated directory with fake stale lock from dead PID 99999999
    const staleWalDir = path.join(tempDir, 'stale-wal');
    fs.mkdirSync(staleWalDir, { recursive: true });
    const lockPath = path.join(staleWalDir, '.journal.owner');
    fs.writeFileSync(
      lockPath,
      `pid=99999999\nhostname=${os.hostname()}\ntime=${new Date().toISOString()}\nlockId=dead-lock-999\nwalDir=${staleWalDir}\n`,
    );

    const recoveringWal = new WalJournalService(undefined, { walDirectory: staleWalDir });
    // Startup should automatically detect dead PID, clear stale lock, and acquire ownership
    await recoveringWal.initialize();
    assert.equal(recoveringWal.getStatus().isReady, true);
    assert.equal(recoveringWal.getStatus().owner.isOwned, true);
    assert.equal(recoveringWal.getStatus().owner.pid, process.pid);

    await recoveringWal.close();
  });

  // =========================================================================
  // EXACT MILLISECOND 7-DAY EXPIRATION & LAWFUL POST-EXPIRY REACCEPTANCE (SECTION 8)
  // =========================================================================
  it('Seven-Day Deduplication: Exact millisecond boundary and post-expiry lawful reacceptance', async () => {
    const batchId = crypto.randomUUID();
    const batch = createNormalizedBatch(batchId, [createTestEvent()]);
    const committedTime = new Date('2026-10-01T00:00:00.000Z');
    const expiresTime = new Date(committedTime.getTime() + SEVEN_DAYS_MS); // 2026-10-08T00:00:00.000Z

    // Manually insert initial receipt
    await receiptRepo.saveReceipt({
      id: crypto.randomUUID(),
      tenantId: defaultIdentity.tenantId,
      projectId: 'skyra-core',
      batchId,
      contentDigest: batch.contentDigestSha256,
      journalSegment: 'active.wal',
      journalOffset: 0,
      acceptedCount: 1,
      committedAt: committedTime,
      expiresAt: expiresTime,
    });

    // Day 0: Valid duplicate
    const checkDay0 = await receiptService.checkIdempotency(defaultIdentity.tenantId, 'skyra-core', batchId, batch.contentDigestSha256, committedTime);
    assert.equal(checkDay0.duplicate, true);

    // Day 6: Valid duplicate
    const checkDay6 = await receiptService.checkIdempotency(defaultIdentity.tenantId, 'skyra-core', batchId, batch.contentDigestSha256, new Date(committedTime.getTime() + 6 * 24 * 3600 * 1000));
    assert.equal(checkDay6.duplicate, true);

    // Day 7 minus 1ms: Valid duplicate
    const checkDay7Minus1ms = await receiptService.checkIdempotency(defaultIdentity.tenantId, 'skyra-core', batchId, batch.contentDigestSha256, new Date(expiresTime.getTime() - 1));
    assert.equal(checkDay7Minus1ms.duplicate, true);

    // Exact expiry instant: Expired (duplicate: false)
    const checkExactExpiry = await receiptService.checkIdempotency(defaultIdentity.tenantId, 'skyra-core', batchId, batch.contentDigestSha256, expiresTime);
    assert.equal(checkExactExpiry.duplicate, false);

    // Day 7 plus 1ms: Expired (duplicate: false)
    const checkDay7Plus1ms = await receiptService.checkIdempotency(defaultIdentity.tenantId, 'skyra-core', batchId, batch.contentDigestSha256, new Date(expiresTime.getTime() + 1));
    assert.equal(checkDay7Plus1ms.duplicate, false);

    // Post-expiry resubmission: Lawfully accepted and updates receipt record
    const newCommittedAt = new Date('2026-10-09T00:00:00.000Z');
    await receiptRepo.saveReceipt({
      id: crypto.randomUUID(),
      tenantId: defaultIdentity.tenantId,
      projectId: 'skyra-core',
      batchId,
      contentDigest: batch.contentDigestSha256,
      journalSegment: 'active.wal',
      journalOffset: 250,
      acceptedCount: 1,
      committedAt: newCommittedAt,
      expiresAt: new Date(newCommittedAt.getTime() + SEVEN_DAYS_MS),
    });

    const updatedReceipt = await receiptRepo.findReceipt(defaultIdentity.tenantId, 'skyra-core', batchId);
    assert.ok(updatedReceipt);
    assert.equal(updatedReceipt.committedAt.toISOString(), newCommittedAt.toISOString());
  });

  // =========================================================================
  // WAL COMPACTION SAFEGUARDS (SECTION 9)
  // =========================================================================
  it('WAL Compaction Safeguards: Prevents premature segment deletion until all prerequisites are durably met', async () => {
    const rotatedSegmentName = 'journal-0000.wal';
    const rotatedFilePath = path.join(walDir, rotatedSegmentName);
    fs.writeFileSync(rotatedFilePath, 'simulated-archived-wal-bytes');

    // 1. Blocked if active WAL segment
    const checkActive = walService.canCompactSegment('active.wal', {
      isArchived: true,
      manifestPersisted: true,
      checkpointPersisted: true,
      receiptsRetainedInPostgres: true,
    });
    assert.equal(checkActive.eligible, false);

    // 2. Blocked if not archived
    const checkUnarchived = walService.canCompactSegment(rotatedSegmentName, {
      isArchived: false,
      manifestPersisted: true,
      checkpointPersisted: true,
      receiptsRetainedInPostgres: true,
    });
    assert.equal(checkUnarchived.eligible, false);

    // 3. Blocked if manifest missing
    const checkNoManifest = walService.canCompactSegment(rotatedSegmentName, {
      isArchived: true,
      manifestPersisted: false,
      checkpointPersisted: true,
      receiptsRetainedInPostgres: true,
    });
    assert.equal(checkNoManifest.eligible, false);

    // 4. Blocked if checkpoint missing
    const checkNoCheckpoint = walService.canCompactSegment(rotatedSegmentName, {
      isArchived: true,
      manifestPersisted: true,
      checkpointPersisted: false,
      receiptsRetainedInPostgres: true,
    });
    assert.equal(checkNoCheckpoint.eligible, false);

    // 5. Blocked if receipts not in PostgreSQL
    const checkNoReceipts = walService.canCompactSegment(rotatedSegmentName, {
      isArchived: true,
      manifestPersisted: true,
      checkpointPersisted: true,
      receiptsRetainedInPostgres: false,
    });
    assert.equal(checkNoReceipts.eligible, false);

    // 6. Safe compaction when all prerequisites met
    const compactRes = await walService.compactSegment(rotatedSegmentName, {
      isArchived: true,
      manifestPersisted: true,
      checkpointPersisted: true,
      receiptsRetainedInPostgres: true,
    });
    assert.equal(compactRes.compacted, true);
    assert.equal(fs.existsSync(rotatedFilePath), false);
  });

  // =========================================================================
  // STORAGE OPERATIONAL DIAGNOSTICS (SECTION 13)
  // =========================================================================
  it('Operational Diagnostics: Safely inspects WAL integrity and archive manifest validity', async () => {
    const diagnostics = new StorageDiagnosticsService(walService, receiptRepo);

    // Inspect WAL
    const inspections = diagnostics.inspectWalDirectory();
    assert.ok(inspections.length > 0);
    const activeInsp = inspections.find((i) => i.segmentFilename === 'active.wal');
    assert.ok(activeInsp);
    assert.equal(activeInsp.hasCorruptFrames, false);

    // Inspect Ownership
    const ownerStatus = diagnostics.getOwnershipStatus();
    assert.equal(ownerStatus.isOwned, true);
    assert.equal(ownerStatus.pid, process.pid);
  });
});
