import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import {
  serializeWalFrame,
  deserializeWalFrame,
  WAL_MAGIC,
  WAL_OVERHEAD_SIZE,
} from './wal-frame.js';
import type { WalFrame, WalCommitReceipt } from '../storage.interface.js';
import { GatewayConfigService } from '../../config/config.service.js';
import { JournalOwnershipManager } from './journal-ownership.js';

export interface CompactionPrerequisites {
  isArchived: boolean;
  manifestPersisted: boolean;
  checkpointPersisted: boolean;
  receiptsRetainedInPostgres: boolean;
  hasActiveReaders?: boolean;
}

export interface WalJournalOptions {
  walDirectory?: string;
  maxSegmentBytes?: number;
  activeSegmentFilename?: string;
}

@Injectable()
export class WalJournalService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WalJournalService.name);

  private readonly walDir: string;
  private readonly maxSegmentBytes: number;
  private readonly activeSegmentName: string;
  public readonly ownershipManager: JournalOwnershipManager;

  private fd: number | null = null;
  private currentOffset = 0;
  private segmentIndex = 0;
  private isInitialized = false;
  private isClosed = false;
  private isRecoveryRequired = false;
  private recoveryError: string | null = null;

  // In-memory index of committed frames for authoritative deduplication (Scenario A reconciliation)
  private readonly committedFrames = new Map<string, WalFrame>();

  // Single-writer asynchronous lock queue
  private writeMutexPromise: Promise<void> = Promise.resolve();

  constructor(
    private readonly configService?: GatewayConfigService,
    options?: WalJournalOptions,
  ) {
    this.walDir = options?.walDirectory ?? process.env['WAL_DIRECTORY'] ?? path.resolve(process.cwd(), 'data', 'wal');
    this.maxSegmentBytes =
      options?.maxSegmentBytes ??
      Number.parseInt(process.env['WAL_MAX_SEGMENT_BYTES'] ?? '67108864', 10); // 64 MiB
    this.activeSegmentName = options?.activeSegmentFilename ?? 'active.wal';
    this.ownershipManager = new JournalOwnershipManager(this.walDir);
  }

  public async onModuleInit(): Promise<void> {
    await this.initialize();
  }

  public async onModuleDestroy(): Promise<void> {
    await this.close();
  }

  /**
   * Initializes the WAL directory and recovers the active journal segment.
   * Returns all recovered valid frames for startup reconciliation.
   */
  public async initialize(): Promise<WalFrame[]> {
    if (this.isInitialized) {
      return [];
    }

    if (!fs.existsSync(this.walDir)) {
      fs.mkdirSync(this.walDir, { recursive: true, mode: 0o750 });
    }

    // Acquire cross-process single-writer exclusive ownership (ADR-011 / ADR-016)
    this.ownershipManager.acquireOwnership();

    const activePath = path.join(this.walDir, this.activeSegmentName);
    const recoveredFrames = this.recoverActiveSegment(activePath);

    for (const frame of recoveredFrames) {
      this.committedFrames.set(`${frame.tenantId}:${frame.projectId}:${frame.batchId}`, frame);
    }

    // Open active segment in append+read mode ('a+' or 'r+')
    this.fd = fs.openSync(activePath, 'a+');
    this.currentOffset = fs.fstatSync(this.fd).size;
    this.isInitialized = true;

    this.logger.log(
      `WAL initialized: active segment=${this.activeSegmentName}, offset=${this.currentOffset}, recovered_batches=${recoveredFrames.length}, recovery_required=${this.isRecoveryRequired}`,
    );

    return recoveredFrames;
  }

  /**
   * Scans the active segment, extracts valid committed frames,
   * and deterministically truncates any incomplete trailing crash write.
   */
  private recoverActiveSegment(filePath: string): WalFrame[] {
    if (!fs.existsSync(filePath)) {
      // Create empty file
      const tempFd = fs.openSync(filePath, 'w');
      fs.closeSync(tempFd);
      return [];
    }

    const fileBuf = fs.readFileSync(filePath);
    const fileSize = fileBuf.length;
    let offset = 0;
    const validFrames: WalFrame[] = [];

    while (offset < fileSize) {
      const remainingBytes = fileSize - offset;
      if (remainingBytes < WAL_OVERHEAD_SIZE) {
        // Trailing partial header from crash mid-write
        this.logger.warn(
          `WAL recovery: detected trailing incomplete header (${remainingBytes} bytes) at offset ${offset}. Truncating to ${offset}.`,
        );
        this.truncateSegment(filePath, offset);
        return validFrames;
      }

      const chunk = fileBuf.subarray(offset);
      const res = deserializeWalFrame(chunk, offset);

      if (!res.valid) {
        // Distinguish torn trailing crash writes from mid-file corruption.
        // If downstream valid frames exist in the remainder of the file, this is mid-file corruption.
        const hasDownstreamValidFrames = this.scanForDownstreamValidFrames(fileBuf, offset + 1);

        if (hasDownstreamValidFrames) {
          this.isRecoveryRequired = true;
          this.recoveryError = `WAL mid-file corruption detected at offset ${offset}: ${res.error}. Downstream committed frames exist. Manual intervention or archive reconciliation required.`;
          this.logger.error(this.recoveryError);
          // Do NOT truncate downstream committed frames!
          return validFrames;
        }

        // Check if there are uncorrupted downstream bytes (bit-rot in non-tail frame)
        if (remainingBytes > (res.bytesConsumed || WAL_OVERHEAD_SIZE) && res.error && !res.error.startsWith('Incomplete frame')) {
          // If the error is an explicit CRC or digest mismatch on a full frame with excess bytes after it
          this.isRecoveryRequired = true;
          this.recoveryError = `WAL corrupt frame detected at offset ${offset}: ${res.error}. Journal requires recovery.`;
          this.logger.error(this.recoveryError);
          return validFrames;
        }

        // Otherwise, it is a torn trailing crash write at the end of the journal
        this.logger.warn(
          `WAL recovery: torn trailing frame at offset ${offset} (${res.error}). Truncating journal to last valid commit at ${offset}.`,
        );
        this.truncateSegment(filePath, offset);
        return validFrames;
      }

      if (res.frame) {
        validFrames.push(res.frame);
      }
      offset += res.bytesConsumed;
    }

    return validFrames;
  }

  private scanForDownstreamValidFrames(buffer: Buffer, startOffset: number): boolean {
    let searchOffset = startOffset;
    while (searchOffset <= buffer.length - WAL_OVERHEAD_SIZE) {
      const magic = buffer.readUInt32BE(searchOffset);
      if (magic === WAL_MAGIC) {
        const probe = deserializeWalFrame(buffer.subarray(searchOffset), searchOffset);
        if (probe.valid && probe.frame) {
          return true;
        }
      }
      searchOffset++;
    }
    return false;
  }

  private truncateSegment(filePath: string, targetOffset: number): void {
    const fd = fs.openSync(filePath, 'r+');
    try {
      fs.ftruncateSync(fd, targetOffset);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  }

  /**
   * Appends a batch frame to the active WAL segment with a synchronous fsync barrier.
   */
  public async appendBatch(
    meta: {
      batchId: string;
      tenantId: string;
      projectId: string;
      eventCount: number;
      contentDigestSha256: string;
    },
    payload: Buffer,
  ): Promise<{ receipt: WalCommitReceipt; frame: WalFrame }> {
    if (!this.isInitialized || this.fd === null || this.isClosed) {
      throw new Error('WAL journal is not open or has been closed');
    }

    // Acquire serialized single-writer mutex
    return this.acquireWriteLock(async () => {
      const frameBuf = serializeWalFrame(meta, payload);
      const frameLen = frameBuf.length;

      // Check rotation boundary
      if (this.currentOffset + frameLen > this.maxSegmentBytes) {
        this.rotateSegment();
      }

      const writeOffset = this.currentOffset;

      // 1. Sequential append syscall
      fs.writeSync(this.fd!, frameBuf, 0, frameLen, writeOffset);

      // 2. Synchronous hardware fsync barrier (MANDATORY per ADR-013 / ADR-016)
      fs.fsyncSync(this.fd!);

      // 3. Update active offset
      this.currentOffset += frameLen;

      const committedAt = new Date().toISOString();
      const receipt: WalCommitReceipt = {
        receiptId: crypto.randomUUID(),
        journalSegment: this.activeSegmentName,
        journalOffset: writeOffset,
        committedAt,
        contentDigest: meta.contentDigestSha256,
        batchId: meta.batchId,
        tenantId: meta.tenantId,
        projectId: meta.projectId,
        acceptedCount: meta.eventCount,
        duplicate: false,
      };

      const frame: WalFrame = {
        magic: WAL_MAGIC,
        version: 1,
        payloadLength: payload.length,
        batchId: meta.batchId,
        tenantId: meta.tenantId,
        projectId: meta.projectId,
        eventCount: meta.eventCount,
        contentDigestSha256: meta.contentDigestSha256,
        payload,
        crc32c: frameBuf.readUInt32BE(WAL_OVERHEAD_SIZE - 4 + payload.length),
        offset: writeOffset,
        frameLength: frameLen,
      };

      // Store in memory index for immediate idempotency lookups
      this.committedFrames.set(`${meta.tenantId}:${meta.projectId}:${meta.batchId}`, frame);

      return { receipt, frame };
    });
  }

  private rotateSegment(): void {
    if (this.fd === null) return;

    fs.fsyncSync(this.fd);
    fs.closeSync(this.fd);

    const oldPath = path.join(this.walDir, this.activeSegmentName);
    const rotatedName = `journal-${this.segmentIndex.toString().padStart(4, '0')}.wal`;
    const rotatedPath = path.join(this.walDir, rotatedName);

    fs.renameSync(oldPath, rotatedPath);
    this.segmentIndex++;

    // Open brand new active segment
    this.fd = fs.openSync(oldPath, 'a+');
    this.currentOffset = 0;

    // Durably sync directory if on supported platform
    try {
      const dirFd = fs.openSync(this.walDir, 'r');
      try {
        fs.fsyncSync(dirFd);
      } catch {
        // Windows does not support directory fsync; ignore unsupported errno
      } finally {
        fs.closeSync(dirFd);
      }
    } catch {
      // Ignore directory open failure on non-POSIX platforms
    }

    this.logger.log(`Rotated active WAL segment to ${rotatedName}. New active segment initialized.`);
  }

  /**
   * Reads all valid frames from a segment starting from a byte offset.
   */
  public readFramesFromOffset(segmentFilename = this.activeSegmentName, startOffset = 0): WalFrame[] {
    const filePath = path.join(this.walDir, segmentFilename);
    if (!fs.existsSync(filePath)) {
      return [];
    }

    const fileBuf = fs.readFileSync(filePath);
    let offset = startOffset;
    const frames: WalFrame[] = [];

    while (offset < fileBuf.length) {
      if (fileBuf.length - offset < WAL_OVERHEAD_SIZE) {
        break;
      }
      const chunk = fileBuf.subarray(offset);
      const res = deserializeWalFrame(chunk, offset);
      if (!res.valid || !res.frame) {
        break;
      }
      frames.push(res.frame);
      offset += res.bytesConsumed;
    }

    return frames;
  }

  public findCommittedFrame(tenantId: string, projectId: string, batchId: string): WalFrame | undefined {
    return this.committedFrames.get(`${tenantId}:${projectId}:${batchId}`);
  }

  public findCommittedFrameByBatchId(batchId: string): WalFrame | undefined {
    for (const frame of this.committedFrames.values()) {
      if (frame.batchId === batchId) {
        return frame;
      }
    }
    return undefined;
  }

  public getAllCommittedFrames(): WalFrame[] {
    return Array.from(this.committedFrames.values());
  }

  public getStatus(): {
    isReady: boolean;
    walDir: string;
    currentOffset: number;
    activeSegment: string;
    isRecoveryRequired: boolean;
    recoveryError: string | null;
    committedCount: number;
    owner: { isOwned: boolean; lockId: string; pid: number; lockPath: string };
  } {
    return {
      isReady: this.isInitialized && !this.isClosed && this.fd !== null && !this.isRecoveryRequired,
      walDir: this.walDir,
      currentOffset: this.currentOffset,
      activeSegment: this.activeSegmentName,
      isRecoveryRequired: this.isRecoveryRequired,
      recoveryError: this.recoveryError,
      committedCount: this.committedFrames.size,
      owner: this.ownershipManager.getStatus(),
    };
  }

  /**
   * Verifies all mandatory prerequisites before a rotated WAL segment can be safely compacted (ADR-014 / ADR-015).
   * Removing an old WAL segment must never destroy the last durable evidence required for 7-day replay.
   */
  public canCompactSegment(segmentName: string, prereqs: CompactionPrerequisites): { eligible: boolean; blockers: string[] } {
    const blockers: string[] = [];

    if (segmentName === this.activeSegmentName) {
      blockers.push('Cannot compact active WAL segment');
    }

    if (!prereqs.isArchived) {
      blockers.push('Committed batches in segment are not fully archived');
    }

    if (!prereqs.manifestPersisted) {
      blockers.push('Archive segment manifest is not durably persisted');
    }

    if (!prereqs.checkpointPersisted) {
      blockers.push('Recovery checkpoint watermark is not durably persisted');
    }

    if (!prereqs.receiptsRetainedInPostgres) {
      blockers.push('Receipt histories not retained in PostgreSQL across 7-day horizon');
    }

    if (prereqs.hasActiveReaders) {
      blockers.push('In-flight reader or recovery process is currently accessing segment');
    }

    return {
      eligible: blockers.length === 0,
      blockers,
    };
  }

  /**
   * Safely deletes an archived rotated WAL segment if and only if all compaction prerequisites are met.
   */
  public async compactSegment(
    segmentName: string,
    prereqs: CompactionPrerequisites,
  ): Promise<{ compacted: boolean; reason?: string }> {
    const check = this.canCompactSegment(segmentName, prereqs);
    if (!check.eligible) {
      this.logger.warn(`Compaction rejected for segment '${segmentName}': ${check.blockers.join('; ')}`);
      return { compacted: false, reason: check.blockers.join('; ') };
    }

    const filePath = path.join(this.walDir, segmentName);
    if (!fs.existsSync(filePath)) {
      return { compacted: false, reason: `Segment file '${segmentName}' does not exist` };
    }

    try {
      fs.unlinkSync(filePath);
      this.logger.log(`Safely compacted and unlinked archived WAL segment: ${segmentName}`);
      return { compacted: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to unlink segment '${segmentName}': ${msg}`);
      return { compacted: false, reason: msg };
    }
  }

  public async close(): Promise<void> {
    if (this.isClosed) return;
    this.isClosed = true;

    await this.writeMutexPromise;

    if (this.fd !== null) {
      try {
        fs.fsyncSync(this.fd);
      } catch {}
      try {
        fs.closeSync(this.fd);
      } catch {}
      this.fd = null;
    }

    // Release cross-process single-writer exclusive ownership lock
    this.ownershipManager.releaseOwnership();
  }

  private async acquireWriteLock<T>(action: () => Promise<T>): Promise<T> {
    let releaseLock: () => void = () => {};
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    const previousLock = this.writeMutexPromise;
    this.writeMutexPromise = lockPromise;

    try {
      await previousLock;
      return await action();
    } finally {
      releaseLock();
    }
  }
}
