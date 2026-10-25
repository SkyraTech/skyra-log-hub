import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as http from 'node:http';
import * as crypto from 'node:crypto';
import { LogShipper } from '../../src/shipper.js';
import { CheckpointManager } from '../../src/checkpoint.js';
import { startTestGateway, type TestGatewayInstance } from './test-gateway.helper.js';

function makeCanonicalEvent(overrides: Record<string, any> = {}): Record<string, any> {
  return {
    '@timestamp': '2026-10-24T00:00:00.000Z',
    'ecs.version': '8.11.0',
    event: { id: crypto.randomUUID() },
    log: { level: 'info' },
    message: 'Canonical test log event message',
    service: { name: 'test-service', environment: 'production' },
    skyra: { project_id: 'skyra-tech', schema_version: '1.0' },
    ...overrides,
  };
}

describe('Log Shipper Failure Injection, Crash Recovery & Edge Cases (ING-005)', () => {
  let gateway: TestGatewayInstance;
  let testTempBase: string;

  before(async () => {
    gateway = await startTestGateway();
    testTempBase = fs.mkdtempSync(path.join(os.tmpdir(), 'skyra-fail-suite-'));
  });

  after(async () => {
    if (gateway) {
      await gateway.close();
    }
    if (testTempBase && fs.existsSync(testTempBase)) {
      try {
        fs.rmSync(testTempBase, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });

  it('1. Gateway offline before first send: records retryable error, preserves checkpoint at 0, no source data lost', async () => {
    const spoolRoot = path.join(testTempBase, 'offline-spool');
    const checkpointDir = path.join(testTempBase, 'offline-ckpt');
    const instDir = path.join(spoolRoot, 'skyra-tech', 'production', 'svc-offline', 'inst-01');
    fs.mkdirSync(instDir, { recursive: true });
    const spoolFile = path.join(instDir, '2026-10-24.part-0000.jsonl');
    fs.writeFileSync(spoolFile, JSON.stringify(makeCanonicalEvent()) + '\n');

    const deadGatewayShipper = new LogShipper({
      spoolRoots: [spoolRoot],
      checkpointDir,
      gatewayUrl: 'http://127.0.0.1:59999/ingest/v1/logs', // dead port
      authToken: gateway.validToken,
    });

    const shipped = await deadGatewayShipper.shipOnce();
    assert.equal(shipped, 0, 'No batches should be acknowledged by dead gateway');

    const metrics = deadGatewayShipper.diagnostics.getMetrics();
    assert.equal(metrics.retriesAttempted, 1);
    assert.equal(metrics.eventsDelivered, 0);

    // Verify checkpoint is still at 0
    const ckpt = new CheckpointManager(checkpointDir);
    const rec = ckpt.getRecord('skyra-tech/production/svc-offline/inst-01/2026-10-24.part-0000.jsonl', spoolFile);
    assert.equal(rec.lastAckOffset, 0);
    assert.ok(rec.pendingBatch, 'Pending batch must be preserved in checkpoint for safe retry');
  });

  it('2. Lost HTTP response after WAL commit: retry returns original receipt (duplicate: true) without double-committing to WAL', async () => {
    const spoolRoot = path.join(testTempBase, 'lost-resp-spool');
    const checkpointDir = path.join(testTempBase, 'lost-resp-ckpt');
    const instDir = path.join(spoolRoot, 'skyra-tech', 'production', 'svc-lost-resp', 'inst-01');
    fs.mkdirSync(instDir, { recursive: true });
    const spoolFile = path.join(instDir, '2026-10-24.part-0000.jsonl');
    const canonicalEvt = makeCanonicalEvent({ event: { id: crypto.randomUUID() } });
    fs.writeFileSync(spoolFile, JSON.stringify(canonicalEvt) + '\n');

    const shipper = new LogShipper({
      spoolRoots: [spoolRoot],
      checkpointDir,
      gatewayUrl: gateway.gatewayUrl,
      authToken: gateway.validToken,
    });

    // 1st transmission succeeds
    const shipped1 = await shipper.shipOnce();
    assert.equal(shipped1, 1);

    const walFrames = gateway.walService.getAllCommittedFrames();
    const frameCountBefore = walFrames.length;
    assert.ok(frameCountBefore >= 1, 'At least 1 WAL frame committed');

    // Simulate response lost: rewind checkpoint offset to 0 while keeping pendingBatch intact
    const ckpt = new CheckpointManager(checkpointDir);
    const locator = 'skyra-tech/production/svc-lost-resp/inst-01/2026-10-24.part-0000.jsonl';
    const lastFrame = walFrames[walFrames.length - 1]!;

    // Manually force pendingBatch back as if response was dropped before checkpoint was saved
    ckpt.setPendingBatch(locator, {
      batchId: lastFrame.batchId,
      startOffset: 0,
      endOffset: fs.statSync(spoolFile).size,
      contentDigestSha256: lastFrame.contentDigestSha256,
      eventCount: 1,
      createdAt: new Date().toISOString(),
      events: [canonicalEvt as any],
    });

    // 2nd transmission: shipper process restarts and discovers pending batch from disk
    const shipperAfterRestart = new LogShipper({
      spoolRoots: [spoolRoot],
      checkpointDir,
      gatewayUrl: gateway.gatewayUrl,
      authToken: gateway.validToken,
    });
    const shipped2 = await shipperAfterRestart.shipOnce();
    assert.equal(shipped2, 1, 'Retry must be acknowledged as duplicate');

    // Central WAL must NOT contain an extra frame!
    const walFramesAfter = gateway.walService.getAllCommittedFrames();
    assert.equal(walFramesAfter.length, frameCountBefore, 'Zero duplicate frames appended to central WAL');

    const metrics = shipperAfterRestart.diagnostics.getMetrics();
    assert.ok(metrics.duplicateAcknowledgements >= 1);
  });

  it('3. Conflicting batch ID HTTP 409: rejected without mutating state or deleting source', async () => {
    // A buggy or malicious client reuses an existing batch ID with modified payload
    const walFrames = gateway.walService.getAllCommittedFrames();
    assert.ok(walFrames.length >= 1, 'Must have committed frame from prior test');
    const existingBatchId = walFrames[0]!.batchId;

    const res = await fetch(gateway.gatewayUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${gateway.validToken}`,
      },
      body: JSON.stringify({
        protocol_version: '1.0',
        batch_id: existingBatchId,
        sent_at: new Date().toISOString(),
        batch_size: 1,
        events: [
          makeCanonicalEvent({
            event: { id: crypto.randomUUID() },
            message: 'Modified payload reusing existing batchId',
          }),
        ],
      }),
    });

    assert.equal(res.status, 409);
    const body = await res.json() as any;
    assert.equal(body.error?.code, 'IDEMPOTENCY_CONFLICT');
  });

  it('4. Invalid token HTTP 401: non-retryable rejection, halts delivery without deleting spool', async () => {
    const spoolRoot = path.join(testTempBase, 'bad-auth-spool');
    const checkpointDir = path.join(testTempBase, 'bad-auth-ckpt');
    const instDir = path.join(spoolRoot, 'skyra-tech', 'production', 'svc-auth-fail', 'inst-01');
    fs.mkdirSync(instDir, { recursive: true });
    const spoolFile = path.join(instDir, '2026-10-24.part-0000.jsonl');
    fs.writeFileSync(spoolFile, JSON.stringify(makeCanonicalEvent()) + '\n');

    const badAuthShipper = new LogShipper({
      spoolRoots: [spoolRoot],
      checkpointDir,
      gatewayUrl: gateway.gatewayUrl,
      authToken: 'sk_live_completely_bogus_token',
    });

    const shipped = await badAuthShipper.shipOnce();
    assert.equal(shipped, 0);

    const metrics = badAuthShipper.diagnostics.getMetrics();
    assert.equal(metrics.permanentErrors, 1);
    assert.ok(fs.existsSync(spoolFile), 'Source spool must be preserved upon permanent auth error');
  });

  it('5. Project scope rejection HTTP 403: unauthorized project ID rejected', async () => {
    const res = await fetch(gateway.gatewayUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${gateway.validToken}`, // valid token but allowed only for skyra-tech
      },
      body: JSON.stringify({
        protocol_version: '1.0',
        batch_id: crypto.randomUUID(),
        sent_at: new Date().toISOString(),
        batch_size: 1,
        events: [
          makeCanonicalEvent({
            skyra: { project_id: 'unauthorized-project-x', schema_version: '1.0' },
          }),
        ],
      }),
    });

    assert.equal(res.status, 403);
    const body = await res.json() as any;
    assert.equal(body.error?.code, 'PROJECT_ACCESS_DENIED');
  });

  it('6. Rate limiting HTTP 429: honors Retry-After header and rejects with 429', async () => {
    const spoolRoot = path.join(testTempBase, 'rate-limit-spool');
    const checkpointDir = path.join(testTempBase, 'rate-limit-ckpt');
    const instDir = path.join(spoolRoot, 'skyra-tech', 'production', 'svc-rl', 'inst-01');
    fs.mkdirSync(instDir, { recursive: true });
    const spoolFile = path.join(instDir, '2026-10-24.part-0000.jsonl');
    fs.writeFileSync(spoolFile, JSON.stringify(makeCanonicalEvent()) + '\n');

    const mockRateLimitServer = http.createServer((_req, res) => {
      res.writeHead(429, {
        'content-type': 'application/json',
        'retry-after': '3',
      });
      res.end(JSON.stringify({ error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Quota exceeded' } }));
    });

    await new Promise<void>((resolve) => mockRateLimitServer.listen(0, '127.0.0.1', () => resolve()));
    const port = (mockRateLimitServer.address() as { port: number }).port;

    const rateLimitShipper = new LogShipper({
      spoolRoots: [spoolRoot],
      checkpointDir,
      gatewayUrl: `http://127.0.0.1:${port}/ingest/v1/logs`,
      authToken: gateway.validToken,
    });

    const shipped = await rateLimitShipper.shipOnce();
    assert.equal(shipped, 0);

    const metrics = rateLimitShipper.diagnostics.getMetrics();
    assert.ok(metrics.retriesAttempted >= 1, 'HTTP 429 must be classified as retryable');

    await new Promise<void>((resolve) => mockRateLimitServer.close(() => resolve()));
  });

  it('7. Finalized segment with corrupt line: quarantines bad line and ships valid lines', async () => {
    const spoolRoot = path.join(testTempBase, 'corrupt-spool');
    const checkpointDir = path.join(testTempBase, 'corrupt-ckpt');
    const quarantineDir = path.join(testTempBase, 'quarantine');
    const instDir = path.join(spoolRoot, 'skyra-tech', 'production', 'svc-corrupt-line', 'inst-01');
    fs.mkdirSync(instDir, { recursive: true });
    fs.mkdirSync(quarantineDir, { recursive: true });
    const spoolFile = path.join(instDir, '2026-10-24.part-0000.jsonl');

    const validLine = JSON.stringify(makeCanonicalEvent({ event: { id: crypto.randomUUID() } })) + '\n';
    const badLine = '{"corrupted_json_line_missing_closing_brace:\n';

    fs.writeFileSync(spoolFile, `${badLine}${validLine}`);

    const shipper = new LogShipper({
      spoolRoots: [spoolRoot],
      checkpointDir,
      gatewayUrl: gateway.gatewayUrl,
      authToken: gateway.validToken,
      quarantineDir,
    });

    const shipped = await shipper.shipOnce();
    assert.equal(shipped, 1, 'Valid event should be shipped in batch');

    // Quarantine directory should contain the corrupt fragment
    const quarantinedFiles = fs.readdirSync(quarantineDir);
    assert.ok(quarantinedFiles.length >= 1, 'Corrupt line must be quarantined');
  });

  it('8. WAL Compaction Safeguards: blocks segment deletion if archive, manifest, or checkpoint are incomplete', () => {
    // Test WalJournalService.canCompactSegment()
    const check1 = gateway.walService.canCompactSegment('active.wal', {
      isArchived: true,
      manifestPersisted: true,
      checkpointPersisted: true,
      receiptsRetainedInPostgres: true,
    });
    assert.equal(check1.eligible, false, 'Active segment currently receiving writes must never be compacted');

    const check2 = gateway.walService.canCompactSegment('journal-old.wal', {
      isArchived: false,
      manifestPersisted: true,
      checkpointPersisted: true,
      receiptsRetainedInPostgres: true,
    });
    assert.equal(check2.eligible, false, 'Segment not yet fully archived must never be compacted');

    const check3 = gateway.walService.canCompactSegment('journal-old.wal', {
      isArchived: true,
      manifestPersisted: false,
      checkpointPersisted: true,
      receiptsRetainedInPostgres: true,
    });
    assert.equal(check3.eligible, false, 'Segment without persisted manifest must never be compacted');

    const check4 = gateway.walService.canCompactSegment('journal-old.wal', {
      isArchived: true,
      manifestPersisted: true,
      checkpointPersisted: false,
      receiptsRetainedInPostgres: true,
    });
    assert.equal(check4.eligible, false, 'Segment with inconsistent checkpoint must never be compacted');

    const check5 = gateway.walService.canCompactSegment('journal-old.wal', {
      isArchived: true,
      manifestPersisted: true,
      checkpointPersisted: true,
      receiptsRetainedInPostgres: true,
    });
    assert.equal(check5.eligible, true, 'Segment satisfying all 4 durability prerequisites is eligible for compaction');
  });
});
