/**
 * @skyra/log-shipper - Deterministic Batch Construction
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import type { SkyraLogEvent } from '@skyra/logger-core/types';
import type { SpoolFile, PendingBatch } from './types.js';

export interface BatchBuilderOptions {
  maxBatchEvents?: number;
  maxBatchBytes?: number;
  quarantineDir?: string;
}

export class BatchBuilder {
  private readonly maxBatchEvents: number;
  private readonly maxBatchBytes: number;
  private readonly quarantineDir?: string;

  constructor(options?: BatchBuilderOptions) {
    this.maxBatchEvents = options?.maxBatchEvents ?? 100;
    this.maxBatchBytes = options?.maxBatchBytes ?? 2 * 1024 * 1024; // 2 MiB
    this.quarantineDir = options?.quarantineDir;

    if (this.quarantineDir && !fs.existsSync(this.quarantineDir)) {
      fs.mkdirSync(this.quarantineDir, { recursive: true });
    }
  }

  /**
   * Reads from a spool file starting at startOffset, constructing a bounded batch.
   * Returns null if no complete unread lines are available.
   */
  public constructBatch(file: SpoolFile, startOffset: number): PendingBatch | null {
    if (!fs.existsSync(file.fullPath)) {
      return null;
    }

    const stat = fs.statSync(file.fullPath);
    if (stat.size <= startOffset) {
      return null; // No new bytes
    }

    // Open file and read from startOffset
    const fd = fs.openSync(file.fullPath, 'r');
    const readLength = Math.min(stat.size - startOffset, this.maxBatchBytes + 65536);
    const buffer = Buffer.alloc(readLength);

    const bytesRead = fs.readSync(fd, buffer, 0, readLength, startOffset);
    fs.closeSync(fd);

    if (bytesRead === 0) {
      return null;
    }

    const events: SkyraLogEvent[] = [];
    let currentBufferOffset = 0;
    let endFileOffset = startOffset;
    let totalBatchBytes = 0;

    while (currentBufferOffset < bytesRead && events.length < this.maxBatchEvents) {
      // Find next newline delimiter
      const nextNewline = buffer.indexOf(0x0a, currentBufferOffset);

      if (nextNewline === -1) {
        // No trailing newline found in buffer
        if (file.isActive) {
          // In active file, an incomplete trailing line is an in-flight write -> stop here
          break;
        } else {
          // In finalized file, check if end of file reached
          if (startOffset + bytesRead >= stat.size) {
            // Trailing line without newline in finalized file -> quarantine if non-empty
            const trailingBytes = bytesRead - currentBufferOffset;
            if (trailingBytes > 0) {
              this.quarantineFragment(
                file,
                startOffset + currentBufferOffset,
                buffer.subarray(currentBufferOffset, bytesRead)
              );
              endFileOffset = startOffset + bytesRead;
            }
          }
          break;
        }
      }

      const lineEnd = nextNewline;
      const lineLen = lineEnd - currentBufferOffset;
      const lineBuf = buffer.subarray(currentBufferOffset, lineEnd);
      const lineStr = lineBuf.toString('utf-8').trim();

      const lineByteLength = lineEnd - currentBufferOffset + 1; // +1 for \n

      if (totalBatchBytes + lineByteLength > this.maxBatchBytes && events.length > 0) {
        // Batch byte ceiling reached -> stop batch here
        break;
      }

      currentBufferOffset = nextNewline + 1;
      endFileOffset = startOffset + currentBufferOffset;
      totalBatchBytes += lineByteLength;

      if (!lineStr) {
        // Blank line -> skip
        continue;
      }

      try {
        const event = JSON.parse(lineStr) as SkyraLogEvent;
        // Verify minimal ECS compliance
        if (event && typeof event === 'object' && event.event && event.event.id) {
          events.push(event);
        } else {
          this.quarantineFragment(file, endFileOffset - lineByteLength, lineBuf);
        }
      } catch {
        this.quarantineFragment(file, endFileOffset - lineByteLength, lineBuf);
      }
    }

    if (events.length === 0) {
      return null;
    }

    const batchId = crypto.randomUUID();
    const contentDigestSha256 = crypto
      .createHash('sha256')
      .update(JSON.stringify(events))
      .digest('hex');

    return {
      batchId,
      startOffset,
      endOffset: endFileOffset,
      contentDigestSha256,
      eventCount: events.length,
      createdAt: new Date().toISOString(),
      events,
    };
  }

  private quarantineFragment(file: SpoolFile, offset: number, fragment: Buffer): void {
    if (!this.quarantineDir) return;

    try {
      const qPath = path.join(
        this.quarantineDir,
        `${file.projectId}.${file.serviceName}.${file.dateStr}.offset-${offset}.corrupt.log`
      );
      fs.appendFileSync(qPath, fragment);
      fs.appendFileSync(qPath, Buffer.from('\n', 'utf-8'));
    } catch {
      // Ignore quarantine write errors
    }
  }
}
