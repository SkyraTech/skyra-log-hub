import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { parseStrictJson } from '@skyra/logger-core';
import { emitInternalDiagnostic } from './diagnostics.js';

export interface RecoveryOptions {
  /**
   * Whether to record raw UTF-8 preview and Base64 bytes in quarantine logs.
   * Security warning: Storing raw fragments may persist unredacted secrets from severed events.
   * Default: false (privacy-safe metadata only).
   */
  enableForensicQuarantine?: boolean;
}

export interface RecoveryResult {
  recovered: boolean;
  bytesQuarantined: number;
  finalSizeBytes: number;
  quarantineLogPath?: string;
  corruptionType?: 'incomplete_trailing_line' | 'malformed_trailing_json';
}

/**
 * Checks an existing JSONL file for incomplete trailing lines or partial JSON fragments.
 * If found:
 * - Safely extracts the trailing bytes
 * - Quarantines the corrupt fragment to ${YYYY-MM-DD}.corrupt.log with offset metadata
 * - Cleanly truncates the .jsonl file back to the last complete newline (\n)
 *
 * Guarantees that new records appended to this file are NEVER concatenated onto
 * corrupt or incomplete JSON fragments.
 */
export function recoverPartialLine(
  filePath: string,
  instanceDir: string,
  dateStr: string,
  options?: RecoveryOptions
): RecoveryResult {
  try {
    if (!fs.existsSync(filePath)) {
      return { recovered: false, bytesQuarantined: 0, finalSizeBytes: 0 };
    }

    const stats = fs.statSync(filePath);
    const totalSize = stats.size;
    if (totalSize === 0) {
      return { recovered: false, bytesQuarantined: 0, finalSizeBytes: 0 };
    }

    // Inspect the tail of the file (up to 128 KiB to cover large structured records)
    const readLength = Math.min(totalSize, 128 * 1024);
    const startOffset = totalSize - readLength;
    const buffer = Buffer.alloc(readLength);

    const fd = fs.openSync(filePath, 'r');
    try {
      fs.readSync(fd, buffer, 0, readLength, startOffset);
    } finally {
      fs.closeSync(fd);
    }

    // Check if the file ends with a valid newline '\n' (0x0A)
    const lastByte = buffer[readLength - 1];
    let needsRecovery = false;
    let corruptionType: 'incomplete_trailing_line' | 'malformed_trailing_json' | undefined;
    let validEndOffset = totalSize;

    if (lastByte !== 0x0A) {
      // Missing terminal newline -> corrupted partial line
      needsRecovery = true;
      corruptionType = 'incomplete_trailing_line';
    } else {
      // Ends with newline. Verify that the last record is complete and parseable JSON
      let secondLastNewlineIndex = -1;
      for (let i = readLength - 2; i >= 0; i--) {
        if (buffer[i] === 0x0A) {
          secondLastNewlineIndex = i;
          break;
        }
      }

      const lastLineStart = secondLastNewlineIndex >= 0 ? secondLastNewlineIndex + 1 : 0;
      const lastLineBytes = buffer.subarray(lastLineStart, readLength - 1); // exclude trailing \n
      const lastLineStr = lastLineBytes.toString('utf-8').trim();

      if (lastLineStr.length > 0) {
        try {
          parseStrictJson(lastLineStr);
        } catch {
          // Last record has \n but is malformed / invalid JSON fragment
          needsRecovery = true;
          corruptionType = 'malformed_trailing_json';
        }
      }
    }

    if (!needsRecovery) {
      return { recovered: false, bytesQuarantined: 0, finalSizeBytes: totalSize };
    }

    // Locate the offset of the last complete newline before the corruption
    let lastValidNewlineOffsetInChunk = -1;
    const searchEnd = lastByte === 0x0A ? readLength - 2 : readLength - 1;
    for (let i = searchEnd; i >= 0; i--) {
      if (buffer[i] === 0x0A) {
        lastValidNewlineOffsetInChunk = i;
        break;
      }
    }

    let corruptFragment: Buffer;
    if (lastValidNewlineOffsetInChunk >= 0) {
      validEndOffset = startOffset + lastValidNewlineOffsetInChunk + 1; // include the valid \n
      const corruptLen = totalSize - validEndOffset;
      const corruptBuf = Buffer.alloc(corruptLen);
      const readFd = fs.openSync(filePath, 'r');
      try {
        fs.readSync(readFd, corruptBuf, 0, corruptLen, validEndOffset);
      } finally {
        fs.closeSync(readFd);
      }
      corruptFragment = corruptBuf;
    } else if (startOffset === 0) {
      // The entire file has no valid newline at all
      validEndOffset = 0;
      corruptFragment = buffer;
    } else {
      // The corrupt line exceeds 128 KiB: read the whole file to find earlier newline
      const wholeFile = fs.readFileSync(filePath);
      const lastNl = wholeFile.lastIndexOf(0x0A);
      if (lastNl >= 0) {
        validEndOffset = lastNl + 1;
        corruptFragment = wholeFile.subarray(validEndOffset);
      } else {
        validEndOffset = 0;
        corruptFragment = wholeFile;
      }
    }

    // Quarantine the corrupt fragment into ${dateStr}.corrupt.log
    const quarantineFilename = `${dateStr}.corrupt.log`;
    const quarantinePath = path.join(instanceDir, quarantineFilename);

    // Compute cryptographic hash of corrupt bytes to enable integrity checks without leaking raw text
    const sha256Hash = crypto.createHash('sha256').update(corruptFragment).digest('hex');

    const metadata: Record<string, unknown> = {
      quarantine_timestamp: new Date().toISOString(),
      source_file: path.basename(filePath),
      truncate_offset: validEndOffset,
      original_file_size: totalSize,
      corrupt_bytes_count: corruptFragment.length,
      corruption_type: corruptionType,
      sha256_hash: sha256Hash,
      safe_error_code: 'CORRUPT_FRAGMENT_QUARANTINED',
    };

    // Only include raw previews if explicitly requested in forensic mode
    if (options?.enableForensicQuarantine === true) {
      metadata['fragment_utf8_preview'] = corruptFragment.toString(
        'utf-8',
        0,
        Math.min(corruptFragment.length, 1024)
      );
      metadata['fragment_base64'] = corruptFragment.toString('base64');
    }

    const quarantineEntry = JSON.stringify(metadata) + '\n';

    // Safe recovery invariant: Write and fsync quarantine record BEFORE truncating source file
    const quarantineFd = fs.openSync(quarantinePath, 'a');
    try {
      const qBuf = Buffer.from(quarantineEntry, 'utf-8');
      fs.writeSync(quarantineFd, qBuf, 0, qBuf.length);
      fs.fsyncSync(quarantineFd);
    } finally {
      fs.closeSync(quarantineFd);
    }

    // Now cleanly truncate the source file to the valid newline offset
    fs.truncateSync(filePath, validEndOffset);

    emitInternalDiagnostic(
      'Recovery',
      `Quarantined ${corruptFragment.length} corrupt bytes (${corruptionType}) from '${path.basename(filePath)}' to '${quarantineFilename}' at offset ${validEndOffset}`
    );

    return {
      recovered: true,
      bytesQuarantined: corruptFragment.length,
      finalSizeBytes: validEndOffset,
      quarantineLogPath: quarantinePath,
      corruptionType,
    };
  } catch (err) {
    emitInternalDiagnostic('RecoveryError', `Failed partial line recovery on '${filePath}'`, err);
    return { recovered: false, bytesQuarantined: 0, finalSizeBytes: 0 };
  }
}
