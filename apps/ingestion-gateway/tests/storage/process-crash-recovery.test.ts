import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WalJournalService } from '../../src/storage/wal/wal-journal.service.js';

describe('Process-Level Crash & Termination Recovery Tests', () => {
  function createTempWalDir(): string {
    const dir = path.join(os.tmpdir(), `process-crash-${crypto.randomUUID()}`);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  it('recovers all committed batches and truncates torn frame after hard process termination (SIGKILL / exit 137)', async () => {
    const walDir = createTempWalDir();
    try {
      // Resolve path to compiled WalJournalService
      const currentDir = path.dirname(fileURLToPath(import.meta.url));
      const walServicePath = path.resolve(currentDir, '../../src/storage/wal/wal-journal.service.js');
      const walServiceUrl = pathToFileURL(walServicePath).href;
      const normalizedWalDir = walDir.replace(/\\/g, '/');

      // 1. Launch a separate child process that commits 2 batches, writes a torn frame, and abruptly crashes
      const childScript = `
        import { WalJournalService } from '${walServiceUrl}';
        import crypto from 'node:crypto';
        import fs from 'node:fs';
        import path from 'node:path';

        const wal = new WalJournalService(undefined, { walDirectory: '${normalizedWalDir}' });
        await wal.initialize();

        for (let i = 0; i < 2; i++) {
          const payload = Buffer.from(JSON.stringify({ eventNumber: i }));
          const digest = 'sha256:' + crypto.createHash('sha256').update(payload).digest('hex');
          await wal.appendBatch({
            batchId: crypto.randomUUID(),
            tenantId: 'tenant-proc',
            projectId: 'proj-proc',
            eventCount: 1,
            contentDigestSha256: digest,
          }, payload);
        }

        // Simulate crash mid-write: append 12 raw bytes (incomplete header) and crash immediately
        const activePath = path.join('${normalizedWalDir}', 'active.wal');
        const fd = fs.openSync(activePath, 'a');
        fs.writeSync(fd, Buffer.from([0x53, 0x4b, 0x59, 0x52, 0x01, 0x00, 0x00, 0x10, 0x00, 0x00, 0x00, 0x00]));
        fs.closeSync(fd);

        // Abrupt termination without graceful shutdown
        process.exit(137);
      `;

      const exitCode = await new Promise<number | null>((resolve, reject) => {
        const child = spawn(process.execPath, ['--input-type=module', '-e', childScript], {
          stdio: 'pipe',
        });
        child.on('error', reject);
        child.on('exit', (code) => resolve(code));
      });

      assert.equal(exitCode, 137, 'Child process must terminate with crash exit code 137');

      // 2. Start a NEW independent gateway process instance on the crashed WAL directory
      const newProcessWal = new WalJournalService(undefined, { walDirectory: walDir });
      const recoveredFrames = await newProcessWal.initialize();

      // Assertions per Section 9 of LOGHUB-ING-003A
      assert.equal(recoveredFrames.length, 2, 'Must recover exactly the 2 committed batches');
      assert.equal(newProcessWal.getStatus().isReady, true, 'Gateway must be ready after recovery');
      assert.equal(newProcessWal.getStatus().isRecoveryRequired, false, 'No unrecoverable corruption');

      // 3. Verify that the journal can accept new appends normally after crash recovery
      const newPayload = Buffer.from(JSON.stringify({ eventNumber: 999 }));
      const newDigest = `sha256:${crypto.createHash('sha256').update(newPayload).digest('hex')}`;
      const appendResult = await newProcessWal.appendBatch(
        {
          batchId: crypto.randomUUID(),
          tenantId: 'tenant-proc',
          projectId: 'proj-proc',
          eventCount: 1,
          contentDigestSha256: newDigest,
        },
        newPayload,
      );

      assert.ok(appendResult.receipt);
      assert.equal(appendResult.receipt.duplicate, false);

      await newProcessWal.close();
    } finally {
      fs.rmSync(walDir, { recursive: true, force: true });
    }
  });
});
