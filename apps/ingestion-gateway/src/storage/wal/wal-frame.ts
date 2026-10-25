import * as crypto from 'node:crypto';
import { crc32c } from './crc32c.js';
import type { WalFrame, WalFrameHeader } from '../storage.interface.js';

export const WAL_MAGIC = 0x534b5952; // 'SKYR'
export const WAL_VERSION = 1;
export const WAL_HEADER_SIZE = 189;
export const WAL_TRAILER_SIZE = 4;
export const WAL_OVERHEAD_SIZE = WAL_HEADER_SIZE + WAL_TRAILER_SIZE; // 193 bytes

/**
 * Encodes a 36-character canonical UUID string into a 16-byte buffer.
 */
export function uuidToBuffer(uuid: string): Buffer {
  const clean = uuid.replace(/-/g, '');
  if (clean.length !== 32) {
    // If not standard 32 hex chars, hash it deterministically
    return crypto.createHash('md5').update(uuid).digest();
  }
  return Buffer.from(clean, 'hex');
}

/**
 * Decodes a 16-byte buffer into a canonical 36-character UUIDv4 string.
 */
export function bufferToUuid(buf: Buffer): string {
  const hex = buf.toString('hex');
  return [
    hex.substring(0, 8),
    hex.substring(8, 12),
    hex.substring(12, 16),
    hex.substring(16, 20),
    hex.substring(20, 32),
  ].join('-');
}

/**
 * Serializes a WAL frame into a contiguous binary Buffer.
 */
export function serializeWalFrame(
  meta: {
    batchId: string;
    tenantId: string;
    projectId: string;
    eventCount: number;
    contentDigestSha256: string;
  },
  payload: Buffer,
): Buffer {
  const payloadLen = payload.length;
  const totalLen = WAL_OVERHEAD_SIZE + payloadLen;
  const frameBuf = Buffer.alloc(totalLen);

  // 1. Magic (4B BE)
  frameBuf.writeUInt32BE(WAL_MAGIC, 0);

  // 2. Version (1B)
  frameBuf.writeUInt8(WAL_VERSION, 4);

  // 3. Payload Length (4B BE)
  frameBuf.writeUInt32BE(payloadLen, 5);

  // 4. Batch UUID (16B)
  const uuidBuf = uuidToBuffer(meta.batchId);
  uuidBuf.copy(frameBuf, 9, 0, 16);

  // 5. Tenant ID (64B null-padded UTF-8)
  frameBuf.fill(0, 25, 89);
  const tenantWritten = frameBuf.write(meta.tenantId, 25, 64, 'utf-8');
  if (tenantWritten > 64) {
    throw new Error(`Tenant ID exceeds 64 bytes: ${meta.tenantId}`);
  }

  // 6. Project ID (64B null-padded UTF-8)
  frameBuf.fill(0, 89, 153);
  const projectWritten = frameBuf.write(meta.projectId, 89, 64, 'utf-8');
  if (projectWritten > 64) {
    throw new Error(`Project ID exceeds 64 bytes: ${meta.projectId}`);
  }

  // 7. Event Count (4B BE)
  frameBuf.writeUInt32BE(meta.eventCount, 153);

  // 8. SHA-256 Digest (32B binary)
  // Strip optional 'sha256:' prefix
  const digestHex = meta.contentDigestSha256.startsWith('sha256:')
    ? meta.contentDigestSha256.slice(7)
    : meta.contentDigestSha256;
  const digestBuf = Buffer.from(digestHex, 'hex');
  if (digestBuf.length !== 32) {
    throw new Error(`Invalid SHA-256 digest length: expected 32 bytes, got ${digestBuf.length}`);
  }
  digestBuf.copy(frameBuf, 157, 0, 32);

  // 9. Payload Bytes (N bytes)
  payload.copy(frameBuf, WAL_HEADER_SIZE, 0, payloadLen);

  // 10. CRC32C Checksum (4B BE) computed over all preceding bytes (0 .. WAL_HEADER_SIZE + payloadLen)
  const checksum = crc32c(frameBuf.subarray(0, WAL_HEADER_SIZE + payloadLen));
  frameBuf.writeUInt32BE(checksum, WAL_HEADER_SIZE + payloadLen);

  return frameBuf;
}

export interface FrameValidationResult {
  valid: boolean;
  frame?: WalFrame;
  error?: string;
  bytesConsumed: number;
}

/**
 * Attempts to parse and validate a single WAL frame from a buffer at a given offset.
 */
export function deserializeWalFrame(
  buffer: Buffer,
  fileOffset: number,
  maxPayloadBytes = 10 * 1024 * 1024,
): FrameValidationResult {
  if (buffer.length < WAL_OVERHEAD_SIZE) {
    return { valid: false, error: 'Incomplete header (less than 193 bytes)', bytesConsumed: 0 };
  }

  // 1. Magic
  const magic = buffer.readUInt32BE(0);
  if (magic !== WAL_MAGIC) {
    return {
      valid: false,
      error: `Invalid magic: expected 0x${WAL_MAGIC.toString(16)}, got 0x${magic.toString(16)}`,
      bytesConsumed: 0,
    };
  }

  // 2. Version
  const version = buffer.readUInt8(4);
  if (version !== WAL_VERSION) {
    return {
      valid: false,
      error: `Unsupported version: expected ${WAL_VERSION}, got ${version}`,
      bytesConsumed: 0,
    };
  }

  // 3. Payload Length
  const payloadLength = buffer.readUInt32BE(5);
  if (payloadLength > maxPayloadBytes) {
    return {
      valid: false,
      error: `Payload length ${payloadLength} exceeds maximum limit ${maxPayloadBytes}`,
      bytesConsumed: 0,
    };
  }

  const expectedTotalLen = WAL_OVERHEAD_SIZE + payloadLength;
  if (buffer.length < expectedTotalLen) {
    return {
      valid: false,
      error: `Incomplete frame: buffer has ${buffer.length} bytes, expected ${expectedTotalLen}`,
      bytesConsumed: 0,
    };
  }

  // 4. CRC32C Verification
  const expectedCrc = buffer.readUInt32BE(WAL_HEADER_SIZE + payloadLength);
  const computedCrc = crc32c(buffer.subarray(0, WAL_HEADER_SIZE + payloadLength));
  if (computedCrc !== expectedCrc) {
    return {
      valid: false,
      error: `CRC32C checksum mismatch: expected 0x${expectedCrc.toString(16)}, computed 0x${computedCrc.toString(16)}`,
      bytesConsumed: 0,
    };
  }

  // 5. Decode fields
  const batchId = bufferToUuid(buffer.subarray(9, 25));

  // Extract null-terminated or trimmed strings
  const tenantRaw = buffer.subarray(25, 89);
  const tenantNullIdx = tenantRaw.indexOf(0);
  const tenantId = (tenantNullIdx >= 0 ? tenantRaw.subarray(0, tenantNullIdx) : tenantRaw).toString('utf-8');

  const projectRaw = buffer.subarray(89, 153);
  const projectNullIdx = projectRaw.indexOf(0);
  const projectId = (projectNullIdx >= 0 ? projectRaw.subarray(0, projectNullIdx) : projectRaw).toString('utf-8');

  const eventCount = buffer.readUInt32BE(153);
  const digestBytes = buffer.subarray(157, 189);
  const contentDigestSha256 = `sha256:${digestBytes.toString('hex')}`;

  const payload = Buffer.from(buffer.subarray(WAL_HEADER_SIZE, WAL_HEADER_SIZE + payloadLength));

  // Verify SHA-256 of payload against header
  const actualPayloadDigest = `sha256:${crypto.createHash('sha256').update(payload).digest('hex')}`;
  if (actualPayloadDigest !== contentDigestSha256) {
    return {
      valid: false,
      error: `Payload SHA-256 digest mismatch: expected ${contentDigestSha256}, got ${actualPayloadDigest}`,
      bytesConsumed: 0,
    };
  }

  const frame: WalFrame = {
    magic,
    version,
    payloadLength,
    batchId,
    tenantId,
    projectId,
    eventCount,
    contentDigestSha256,
    payload,
    crc32c: expectedCrc,
    offset: fileOffset,
    frameLength: expectedTotalLen,
  };

  return {
    valid: true,
    frame,
    bytesConsumed: expectedTotalLen,
  };
}
