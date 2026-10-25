import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import {
  serializeWalFrame,
  deserializeWalFrame,
  WAL_MAGIC,
  WAL_VERSION,
  WAL_OVERHEAD_SIZE,
} from '../../src/storage/wal/wal-frame.js';

describe('WAL Framing & Integrity Tests', () => {
  it('should serialize and deserialize a valid WAL frame correctly', () => {
    const batchId = crypto.randomUUID();
    const tenantId = 'tenant-test-01';
    const projectId = 'proj-skyra-01';
    const payload = Buffer.from(JSON.stringify([{ skyra: { event_id: crypto.randomUUID() }, message: 'Hello WAL' }]));
    const contentDigestSha256 = `sha256:${crypto.createHash('sha256').update(payload).digest('hex')}`;

    const frameBuf = serializeWalFrame(
      {
        batchId,
        tenantId,
        projectId,
        eventCount: 1,
        contentDigestSha256,
      },
      payload,
    );

    assert.equal(frameBuf.length, WAL_OVERHEAD_SIZE + payload.length);

    const result = deserializeWalFrame(frameBuf, 1024);
    assert.equal(result.valid, true);
    assert.ok(result.frame);
    assert.equal(result.frame?.batchId, batchId);
    assert.equal(result.frame?.tenantId, tenantId);
    assert.equal(result.frame?.projectId, projectId);
    assert.equal(result.frame?.eventCount, 1);
    assert.equal(result.frame?.contentDigestSha256, contentDigestSha256);
    assert.equal(result.frame?.offset, 1024);
    assert.equal(result.frame?.payload.toString('utf-8'), payload.toString('utf-8'));
  });

  it('should reject a corrupted frame with bit flip in payload', () => {
    const batchId = crypto.randomUUID();
    const payload = Buffer.from('unaltered payload');
    const contentDigest = `sha256:${crypto.createHash('sha256').update(payload).digest('hex')}`;

    const frameBuf = serializeWalFrame(
      {
        batchId,
        tenantId: 'tenant-1',
        projectId: 'proj-1',
        eventCount: 1,
        contentDigestSha256: contentDigest,
      },
      payload,
    );

    // Corrupt one byte in payload
    frameBuf[WAL_OVERHEAD_SIZE - 2]! ^= 0xff;

    const result = deserializeWalFrame(frameBuf, 0);
    assert.equal(result.valid, false);
    assert.match(result.error ?? '', /CRC32C checksum mismatch/);
  });

  it('should reject a frame with invalid magic', () => {
    const payload = Buffer.from('test');
    const digest = `sha256:${crypto.createHash('sha256').update(payload).digest('hex')}`;
    const frameBuf = serializeWalFrame(
      {
        batchId: crypto.randomUUID(),
        tenantId: 'tenant-1',
        projectId: 'proj-1',
        eventCount: 1,
        contentDigestSha256: digest,
      },
      payload,
    );

    frameBuf.writeUInt32BE(0x12345678, 0); // wrong magic

    const result = deserializeWalFrame(frameBuf, 0);
    assert.equal(result.valid, false);
    assert.match(result.error ?? '', /Invalid magic/);
  });

  it('should report incomplete frame when buffer is truncated', () => {
    const payload = Buffer.from('some large payload chunk');
    const digest = `sha256:${crypto.createHash('sha256').update(payload).digest('hex')}`;
    const frameBuf = serializeWalFrame(
      {
        batchId: crypto.randomUUID(),
        tenantId: 'tenant-1',
        projectId: 'proj-1',
        eventCount: 1,
        contentDigestSha256: digest,
      },
      payload,
    );

    const truncated = frameBuf.subarray(0, frameBuf.length - 10);
    const result = deserializeWalFrame(truncated, 0);
    assert.equal(result.valid, false);
    assert.match(result.error ?? '', /Incomplete frame/);
  });
});
