import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { WalJournalService } from '../../src/storage/wal/wal-journal.service.js';
import { serializeWalFrame, deserializeWalFrame, WAL_OVERHEAD_SIZE } from '../../src/storage/wal/wal-frame.js';
import { HealthService } from '../../src/health/health.service.js';
import { PrismaService } from '../../src/metadata/prisma.service.js';

describe('WAL Mid-File Corruption vs Torn Trailing Crash Recovery', () => {
  function createTempWalDir(): string {
    const dir = path.join(os.tmpdir(), `wal-hardening-${crypto.randomUUID()}`);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  it('safely truncates torn trailing incomplete header at end of journal', async () => {
    const walDir = createTempWalDir();
    try {
      const wal = new WalJournalService(undefined, { walDirectory: walDir });
      await wal.initialize();

      // Commit 1 valid frame
      const payload = Buffer.from(JSON.stringify([{ msg: 'event 1' }]));
      const digest = `sha256:${crypto.createHash('sha256').update(payload).digest('hex')}`;
      await wal.appendBatch(
        {
          batchId: crypto.randomUUID(),
          tenantId: 'tenant-1',
          projectId: 'proj-1',
          eventCount: 1,
          contentDigestSha256: digest,
        },
        payload,
      );
      const validSize = wal.getStatus().currentOffset;
      await wal.close();

      // Simulate crash mid-write: write 25 trailing garbage bytes (less than WAL_OVERHEAD_SIZE)
      const activePath = path.join(walDir, 'active.wal');
      fs.appendFileSync(activePath, Buffer.alloc(25, 0xaa));

      // Reopen WAL: recovery should detect torn trailing frame and truncate cleanly
      const wal2 = new WalJournalService(undefined, { walDirectory: walDir });
      const recovered = await wal2.initialize();

      assert.equal(recovered.length, 1);
      const status = wal2.getStatus();
      assert.equal(status.isRecoveryRequired, false);
      assert.equal(status.isReady, true);
      assert.equal(status.currentOffset, validSize);
      assert.equal(fs.statSync(activePath).size, validSize);

      await wal2.close();
    } finally {
      fs.rmSync(walDir, { recursive: true, force: true });
    }
  });

  it('detects mid-file corruption without truncating downstream committed frames and flags recovery-required', async () => {
    const walDir = createTempWalDir();
    try {
      const wal = new WalJournalService(undefined, { walDirectory: walDir });
      await wal.initialize();

      // Commit 3 frames
      const frameIds: string[] = [];
      for (let i = 1; i <= 3; i++) {
        const payload = Buffer.from(JSON.stringify([{ index: i }]));
        const digest = `sha256:${crypto.createHash('sha256').update(payload).digest('hex')}`;
        const batchId = crypto.randomUUID();
        frameIds.push(batchId);
        await wal.appendBatch(
          {
            batchId,
            tenantId: 'tenant-alpha',
            projectId: 'proj-alpha',
            eventCount: 1,
            contentDigestSha256: digest,
          },
          payload,
        );
      }
      const totalSizeBeforeCrash = wal.getStatus().currentOffset;
      await wal.close();

      const activePath = path.join(walDir, 'active.wal');
      const fileBuf = fs.readFileSync(activePath);

      // Frame 1 is valid. Frame 2 is in the middle. Let's find Frame 2's offset.
      const frame1Result = deserializeWalFrame(fileBuf, 0);
      assert.ok(frame1Result.valid && frame1Result.frame);
      const frame2Offset = frame1Result.bytesConsumed;

      // Corrupt Frame 2's payload bytes in the middle of the file (flip bits)
      // Frame 2 header is at frame2Offset, payload starts at frame2Offset + 189
      fileBuf[frame2Offset + 192]! ^= 0xff;
      fs.writeFileSync(activePath, fileBuf);

      // Reopen WAL: recovery scans the file
      const walRecovering = new WalJournalService(undefined, { walDirectory: walDir });
      const recovered = await walRecovering.initialize();

      // Frame 1 is returned
      assert.equal(recovered.length, 1);
      assert.equal(recovered[0]!.batchId, frameIds[0]);

      // Mid-file corruption must be flagged as recovery required
      const status = walRecovering.getStatus();
      assert.equal(status.isRecoveryRequired, true);
      assert.ok(status.recoveryError, 'Must have a recoveryError description');
      assert.match(status.recoveryError!, /WAL mid-file corruption detected at offset/);
      assert.equal(status.isReady, false, 'WAL must not be ready when recovery is required');

      // CRITICAL INVARIANT: File must NOT be truncated, downstream Frame 3 must remain preserved on disk!
      const finalFileSize = fs.statSync(activePath).size;
      assert.equal(finalFileSize, totalSizeBeforeCrash, 'Downstream committed data must not be destroyed by truncation');

      // Health readiness must surface this as not_ready
      const mockPrisma = { isHealthy: async () => true } as unknown as PrismaService;
      const health = new HealthService(mockPrisma, walRecovering);
      const readiness = await health.getReadiness();
      assert.equal(readiness.status, 'not_ready');
      assert.equal(readiness.durability_backend, 'unavailable');
      assert.match(readiness.reason!, /WAL mid-file corruption/);

      await walRecovering.close();
    } finally {
      fs.rmSync(walDir, { recursive: true, force: true });
    }
  });
});
