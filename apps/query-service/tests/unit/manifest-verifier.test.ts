import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { ManifestVerifierService } from '../../src/modules/archive-discovery/application/manifest-verifier.service.js';

describe('ManifestVerifierService Unit Tests (LOGHUB-QUERY-002)', () => {
  let tempRoot: string;
  let verifier: ManifestVerifierService;

  before(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skyra-manifest-verifier-'));
    verifier = new ManifestVerifierService();
  });

  after(() => {
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('should successfully verify valid segment file matching checksum and byte size', async () => {
    const dir = path.join(tempRoot, 't1', 'p1', '2026', '10', '25');
    fs.mkdirSync(dir, { recursive: true });

    const segmentContent = '{"msg":"log event 1"}\n{"msg":"log event 2"}\n';
    const segmentPath = path.join(dir, 'segment_01.jsonl');
    fs.writeFileSync(segmentPath, segmentContent, 'utf8');

    const expectedChecksum = crypto.createHash('sha256').update(segmentContent).digest('hex');
    const expectedBytes = Buffer.byteLength(segmentContent);

    // Also write a matching manifest file
    const manifestPath = path.join(dir, 'segment_01.manifest.json');
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({
        segment_filename: 'segment_01.jsonl',
        byte_size: expectedBytes,
        sha256_checksum: expectedChecksum,
        record_count: 2,
      }),
      'utf8',
    );

    const result = await verifier.verifySegmentAndManifest(segmentPath, expectedChecksum, expectedBytes);

    assert.equal(result.status, 'VERIFIED');
    assert.equal(result.actualChecksum, expectedChecksum);
    assert.equal(result.actualByteSize, expectedBytes);
  });

  it('should return CORRUPT on checksum mismatch (tampered file)', async () => {
    const dir = path.join(tempRoot, 't1', 'p1', '2026', '10', '25');
    fs.mkdirSync(dir, { recursive: true });

    const segmentPath = path.join(dir, 'corrupted_segment.jsonl');
    fs.writeFileSync(segmentPath, '{"tampered":true}\n', 'utf8');

    const result = await verifier.verifySegmentAndManifest(
      segmentPath,
      '0000000000000000000000000000000000000000000000000000000000000000',
      18,
    );

    assert.equal(result.status, 'CORRUPT');
    assert.match(result.reason ?? '', /SHA-256 checksum mismatch/);
  });

  it('should return CORRUPT on size mismatch', async () => {
    const dir = path.join(tempRoot, 't1', 'p1', '2026', '10', '25');
    fs.mkdirSync(dir, { recursive: true });

    const segmentContent = 'valid content';
    const segmentPath = path.join(dir, 'size_mismatch.jsonl');
    fs.writeFileSync(segmentPath, segmentContent, 'utf8');

    const expectedChecksum = crypto.createHash('sha256').update(segmentContent).digest('hex');

    const result = await verifier.verifySegmentAndManifest(
      segmentPath,
      expectedChecksum,
      999999, // wrong size
    );

    assert.equal(result.status, 'CORRUPT');
    assert.match(result.reason ?? '', /does not match expected size/);
  });

  it('should return MISSING if segment file does not exist', async () => {
    const result = await verifier.verifySegmentAndManifest(
      path.join(tempRoot, 'non-existent.jsonl'),
      'somehash',
      10,
    );
    assert.equal(result.status, 'MISSING');
  });
});
