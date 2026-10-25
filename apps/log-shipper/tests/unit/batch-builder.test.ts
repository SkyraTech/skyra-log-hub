import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { BatchBuilder } from '../../src/batch-builder.js';
import type { SpoolFile } from '../../src/types.js';

describe('BatchBuilder Unit Tests', () => {
  let tempDir: string;
  let qDir: string;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyra-builder-test-'));
    qDir = path.join(tempDir, 'quarantine');
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

  it('constructs batch from valid JSONL file and computes content digest', () => {
    const filePath = path.join(tempDir, 'sample.jsonl');
    const line1 = JSON.stringify({
      '@timestamp': '2026-10-24T00:00:00.000Z',
      'ecs.version': '8.11.0',
      event: { id: '00000000-0000-4000-8000-000000000001' },
      log: { level: 'info' },
      message: 'Event 1',
    });
    const line2 = JSON.stringify({
      '@timestamp': '2026-10-24T00:00:01.000Z',
      'ecs.version': '8.11.0',
      event: { id: '00000000-0000-4000-8000-000000000002' },
      log: { level: 'info' },
      message: 'Event 2',
    });
    fs.writeFileSync(filePath, `${line1}\n${line2}\n`);

    const spoolFile: SpoolFile = {
      fullPath: filePath,
      relativeLocator: 'sample.jsonl',
      projectId: 'skyra-tech',
      environment: 'production',
      serviceName: 'api',
      instanceId: 'inst-01',
      dateStr: '2026-10-24',
      partIndex: 0,
      isActive: false,
      sizeBytes: fs.statSync(filePath).size,
      mtimeMs: Date.now(),
    };

    const builder = new BatchBuilder({ maxBatchEvents: 10, quarantineDir: qDir });
    const batch = builder.constructBatch(spoolFile, 0);

    assert.ok(batch);
    assert.equal(batch.eventCount, 2);
    assert.equal(batch.events.length, 2);
    assert.equal(batch.startOffset, 0);
    assert.equal(batch.endOffset, spoolFile.sizeBytes);
    assert.ok(batch.batchId);
    assert.ok(batch.contentDigestSha256);
  });

  it('active file safety: discards trailing incomplete line without flagging corruption', () => {
    const filePath = path.join(tempDir, 'active.jsonl');
    const completeLine = JSON.stringify({
      '@timestamp': '2026-10-24T00:00:00.000Z',
      'ecs.version': '8.11.0',
      event: { id: '00000000-0000-4000-8000-000000000001' },
      log: { level: 'info' },
      message: 'Complete Line',
    });
    const incompleteFragment = '{"@timestamp":"2026-10-24T00:00:01.000Z","incomplete":';
    fs.writeFileSync(filePath, `${completeLine}\n${incompleteFragment}`);

    const spoolFile: SpoolFile = {
      fullPath: filePath,
      relativeLocator: 'active.jsonl',
      projectId: 'skyra-tech',
      environment: 'production',
      serviceName: 'api',
      instanceId: 'inst-01',
      dateStr: '2026-10-24',
      partIndex: 0,
      isActive: true, // Marked as active
      sizeBytes: fs.statSync(filePath).size,
      mtimeMs: Date.now(),
    };

    const builder = new BatchBuilder({ maxBatchEvents: 10, quarantineDir: qDir });
    const batch = builder.constructBatch(spoolFile, 0);

    assert.ok(batch);
    assert.equal(batch.eventCount, 1);
    assert.equal(batch.endOffset, Buffer.byteLength(`${completeLine}\n`, 'utf-8'));

    // Check quarantine directory: must be empty because in-flight active line is NOT corrupt!
    const quarantined = fs.existsSync(qDir) ? fs.readdirSync(qDir) : [];
    assert.equal(quarantined.length, 0);
  });
});
