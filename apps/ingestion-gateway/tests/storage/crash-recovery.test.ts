import { describe, it, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { WalJournalService } from '../../src/storage/wal/wal-journal.service.js';

describe('WAL Crash Recovery & Rotation Tests', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyra-wal-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should initialize cleanly in an empty directory and commit a batch with fsync', async () => {
    const walService = new WalJournalService(undefined, { walDirectory: tempDir });
    const recovered = await walService.initialize();
    assert.equal(recovered.length, 0);

    const batchId = crypto.randomUUID();
    const payload = Buffer.from(JSON.stringify([{ message: 'test event 1' }]));
    const digest = `sha256:${crypto.createHash('sha256').update(payload).digest('hex')}`;

    const { receipt, frame } = await walService.appendBatch(
      {
        batchId,
        tenantId: 'tenant-alpha',
        projectId: 'project-one',
        eventCount: 1,
        contentDigestSha256: digest,
      },
      payload,
    );

    assert.equal(receipt.batchId, batchId);
    assert.equal(receipt.journalSegment, 'active.wal');
    assert.equal(receipt.journalOffset, 0);
    assert.equal(receipt.acceptedCount, 1);
    assert.equal(frame.payloadLength, payload.length);

    await walService.close();

    // Verify raw file on disk
    const activeFile = path.join(tempDir, 'active.wal');
    assert.ok(fs.existsSync(activeFile));
    assert.ok(fs.statSync(activeFile).size > 0);
  });

  it('should recover committed batches across simulated process restart', async () => {
    const walService1 = new WalJournalService(undefined, { walDirectory: tempDir });
    await walService1.initialize();

    const batchId1 = crypto.randomUUID();
    const payload1 = Buffer.from(JSON.stringify([{ msg: 'commit-1' }]));
    const digest1 = `sha256:${crypto.createHash('sha256').update(payload1).digest('hex')}`;

    await walService1.appendBatch(
      {
        batchId: batchId1,
        tenantId: 'tenant-1',
        projectId: 'proj-1',
        eventCount: 1,
        contentDigestSha256: digest1,
      },
      payload1,
    );

    const batchId2 = crypto.randomUUID();
    const payload2 = Buffer.from(JSON.stringify([{ msg: 'commit-2' }]));
    const digest2 = `sha256:${crypto.createHash('sha256').update(payload2).digest('hex')}`;

    await walService1.appendBatch(
      {
        batchId: batchId2,
        tenantId: 'tenant-1',
        projectId: 'proj-1',
        eventCount: 1,
        contentDigestSha256: digest2,
      },
      payload2,
    );

    await walService1.close();

    // Simulate process reboot by instantiating a new service instance against the same directory
    const walService2 = new WalJournalService(undefined, { walDirectory: tempDir });
    const recovered = await walService2.initialize();

    assert.equal(recovered.length, 2);
    assert.equal(recovered[0]?.batchId, batchId1);
    assert.equal(recovered[1]?.batchId, batchId2);

    // Append new batch after recovery
    const batchId3 = crypto.randomUUID();
    const payload3 = Buffer.from(JSON.stringify([{ msg: 'commit-3' }]));
    const digest3 = `sha256:${crypto.createHash('sha256').update(payload3).digest('hex')}`;

    const { receipt } = await walService2.appendBatch(
      {
        batchId: batchId3,
        tenantId: 'tenant-1',
        projectId: 'proj-1',
        eventCount: 1,
        contentDigestSha256: digest3,
      },
      payload3,
    );

    assert.ok(receipt.journalOffset > 0);
    await walService2.close();
  });

  it('should detect trailing incomplete crash write and truncate to last valid frame', async () => {
    const walService1 = new WalJournalService(undefined, { walDirectory: tempDir });
    await walService1.initialize();

    const batchId = crypto.randomUUID();
    const payload = Buffer.from('solid committed frame');
    const digest = `sha256:${crypto.createHash('sha256').update(payload).digest('hex')}`;

    const { frame } = await walService1.appendBatch(
      {
        batchId,
        tenantId: 'tenant-1',
        projectId: 'proj-1',
        eventCount: 1,
        contentDigestSha256: digest,
      },
      payload,
    );

    const validSize = frame.frameLength;
    await walService1.close();

    // Simulate mid-write power loss or OS crash by appending 45 random garbage bytes to EOF
    const activeFile = path.join(tempDir, 'active.wal');
    const fd = fs.openSync(activeFile, 'a');
    fs.writeSync(fd, Buffer.from('INCOMPLETE_CRASH_GARBAGE_BYTES_SIMULATION_XX'));
    fs.closeSync(fd);

    assert.ok(fs.statSync(activeFile).size > validSize);

    // Boot new service: recovery must detect corruption on trailing fragment and truncate
    const walService2 = new WalJournalService(undefined, { walDirectory: tempDir });
    const recovered = await walService2.initialize();

    assert.equal(recovered.length, 1);
    assert.equal(recovered[0]?.batchId, batchId);

    // Active file size must have been truncated back to validSize
    assert.equal(fs.statSync(activeFile).size, validSize);

    await walService2.close();
  });

  it('should rotate active segment when reaching maxSegmentBytes threshold', async () => {
    // Set low maxSegmentBytes = 500 bytes to force immediate rotation
    const walService = new WalJournalService(undefined, {
      walDirectory: tempDir,
      maxSegmentBytes: 400,
    });
    await walService.initialize();

    const payload = Buffer.alloc(150, 'x'); // ~343 bytes total frame
    const digest = `sha256:${crypto.createHash('sha256').update(payload).digest('hex')}`;

    // First frame fits in active.wal
    await walService.appendBatch(
      {
        batchId: crypto.randomUUID(),
        tenantId: 'tenant-1',
        projectId: 'proj-1',
        eventCount: 1,
        contentDigestSha256: digest,
      },
      payload,
    );

    // Second frame triggers rotation before write
    await walService.appendBatch(
      {
        batchId: crypto.randomUUID(),
        tenantId: 'tenant-1',
        projectId: 'proj-1',
        eventCount: 1,
        contentDigestSha256: digest,
      },
      payload,
    );

    await walService.close();

    // Check directory: should contain journal-0000.wal and active.wal
    assert.ok(fs.existsSync(path.join(tempDir, 'journal-0000.wal')));
    assert.ok(fs.existsSync(path.join(tempDir, 'active.wal')));
  });
});
