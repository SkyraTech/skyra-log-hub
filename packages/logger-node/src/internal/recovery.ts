import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseStrictJson } from '@skyra/logger-core';
import { emitInternalDiagnostic } from './diagnostics.js';

export interface RecoveryResult {
  recovered: boolean;
  bytesQuarantined: number;
  finalSizeBytes: number;
  quarantineLogPath?: string;
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
export function recoverPartialLine(filePath: string, instanceDir: string, dateStr: string): RecoveryResult {
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
    let validEndOffset = totalSize;

    if (lastByte !== 0x0A) {
      // Missing terminal newline -> corrupted partial line
      needsRecovery = true;
    } else {
      // Ends with newline. Verify that the last record is complete and parseable JSON
      // Find the newline before the last newline to isolate the last line
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
        }
      }
    }

    if (!needsRecovery) {
      return { recovered: false, bytesQuarantined: 0, finalSizeBytes: totalSize };
    }

    // Locate the offset of the last complete newline before the corruption
    let lastValidNewlineOffsetInChunk = -1;
    // If lastByte was newline but record was invalid, we search backwards from second to last
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

    const quarantineEntry = JSON.stringify({
      quarantine_timestamp: new Date().toISOString(),
      source_file: path.basename(filePath),
      truncate_offset: validEndOffset,
      original_file_size: totalSize,
      corrupt_bytes_count: corruptFragment.length,
      fragment_utf8_preview: corruptFragment.toString('utf-8', 0, Math.min(corruptFragment.length, 1024)),
      fragment_base64: corruptFragment.toString('base64'),
    }) + '\n';

    fs.appendFileSync(quarantinePath, quarantineEntry, 'utf-8');

    // Cleanly truncate the file to the valid newline offset
    fs.truncateSync(filePath, validEndOffset);

    emitInternalDiagnostic(
      'Recovery',
      `Quarantined ${corruptFragment.length} corrupt bytes from '${path.basename(filePath)}' to '${quarantineFilename}' at offset ${validEndOffset}`
    );

    return {
      recovered: true,
      bytesQuarantined: corruptFragment.length,
      finalSizeBytes: validEndOffset,
      quarantineLogPath: quarantinePath,
    };
  } catch (err) {
    emitInternalDiagnostic('RecoveryError', `Failed partial line recovery on '${filePath}'`, err);
    return { recovered: false, bytesQuarantined: 0, finalSizeBytes: 0 };
  }
}
