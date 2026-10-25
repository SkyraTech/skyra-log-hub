import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SpoolDiscovery } from '../../src/discovery.js';
import { assertPathContained, PathSafetyError } from '../../src/path-safety.js';

describe('SpoolDiscovery Unit Tests', () => {
  let tempRoot: string;

  before(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skyra-shipper-disc-'));
  });

  after(() => {
    if (tempRoot && fs.existsSync(tempRoot)) {
      try {
        fs.rmSync(tempRoot, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });

  it('rejects path traversal attempting to escape spool root', () => {
    assert.throws(
      () => {
        assertPathContained(path.join(tempRoot, '..', 'forbidden.jsonl'), tempRoot);
      },
      (err: Error) => {
        assert.ok(err instanceof PathSafetyError);
        assert.match(err.message, /Path traversal rejected/);
        return true;
      }
    );
  });

  it('discovers spool files in deterministic hierarchy and distinguishes active segments', () => {
    const instDir1 = path.join(tempRoot, 'skyra-tech', 'production', 'api-service', 'inst-01');
    const instDir2 = path.join(tempRoot, 'skyra-tech', 'production', 'api-service', 'inst-02');

    fs.mkdirSync(instDir1, { recursive: true });
    fs.mkdirSync(instDir2, { recursive: true });

    // inst-01 has active instance owner
    fs.writeFileSync(path.join(instDir1, '.instance.owner'), JSON.stringify({ pid: process.pid }));
    fs.writeFileSync(path.join(instDir1, '2026-10-24.part-0000.jsonl'), '{"event":{"id":"e1"}}\n');
    fs.writeFileSync(path.join(instDir1, '2026-10-24.part-0001.jsonl'), '{"event":{"id":"e2"}}\n');

    // inst-02 is finalized (no owner lock)
    fs.writeFileSync(path.join(instDir2, '2026-10-23.part-0000.jsonl'), '{"event":{"id":"e0"}}\n');

    const discovery = new SpoolDiscovery([tempRoot]);
    const files = discovery.discoverSpoolFiles();

    assert.equal(files.length, 3);

    // Finalized files must be sorted first!
    assert.equal(files[0]!.dateStr, '2026-10-23');
    assert.equal(files[0]!.isActive, false);

    // Older part file of inst-01 is finalized
    assert.equal(files[1]!.partIndex, 0);
    assert.equal(files[1]!.isActive, false);

    // Highest part file of inst-01 is active
    assert.equal(files[2]!.partIndex, 1);
    assert.equal(files[2]!.isActive, true);
  });
});
