/**
 * CRC32C (Castagnoli) Checksum Implementation
 * Polynomial: 0x82F63B78 (Reflected)
 * Standard test vector: '123456789' -> 0xE3069283
 */

const CRC32C_TABLE = new Uint32Array(256);

// Precompute CRC32C lookup table
(() => {
  const POLY = 0x82f63b78;
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
      if ((crc & 1) !== 0) {
        crc = (crc >>> 1) ^ POLY;
      } else {
        crc >>>= 1;
      }
    }
    CRC32C_TABLE[i] = crc >>> 0;
  }
})();

/**
 * Computes the 32-bit CRC32C checksum of the given buffer.
 */
export function crc32c(buffer: Uint8Array | Buffer, seed = 0): number {
  let crc = (seed ^ 0xffffffff) >>> 0;
  const len = buffer.length;
  for (let i = 0; i < len; i++) {
    const byte = buffer[i]!;
    crc = (CRC32C_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8)) >>> 0;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
