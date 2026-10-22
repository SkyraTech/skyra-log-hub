import * as fs from 'node:fs';
import * as path from 'node:path';
import type { LogLevel } from '@skyra/logger-core';
import type { ResolvedSkyraLoggerConfig, FileTransportConfig } from '../config.js';
import type { SkyraTransport, TransportStatus } from './transport.interface.js';
import { resolveSafeLogDirectory } from '../internal/path-safety.js';
import {
  formatUtcDate,
  formatPartIndex,
  buildPartFilename,
  resolveActiveFileState,
} from '../internal/rotation.js';
import { recoverPartialLine } from '../internal/recovery.js';
import { emitInternalDiagnostic } from '../internal/diagnostics.js';

import { InstanceOwnershipManager } from '../internal/ownership.js';

export class JsonlFileTransport implements SkyraTransport {
  private readonly instanceDir: string;
  private readonly maxFileSizeBytes: number;
  private readonly fsyncLevels: Set<LogLevel>;
  private readonly clock: () => Date;
  private readonly dirMode: number;
  private readonly fileMode: number;
  private readonly ownershipManager: InstanceOwnershipManager;

  private currentFd: number | null = null;
  private currentDateStr = '';
  private currentPartIndex = 0;
  private currentSizeBytes = 0;
  private currentFilename = '';
  private isClosed = false;

  private totalEventsWritten = 0;
  private totalBytesWritten = 0;
  private totalEventsFsynced = 0;

  constructor(
    private readonly config: ResolvedSkyraLoggerConfig,
    fileConfig: FileTransportConfig
  ) {
    this.maxFileSizeBytes = fileConfig.rotation?.maxFileSizeBytes ?? 100 * 1024 * 1024;
    this.fsyncLevels = config.fsyncOnLevels;
    this.clock = config.clock;
    this.dirMode = fileConfig.permissions?.dirMode ?? 0o750;
    this.fileMode = fileConfig.permissions?.fileMode ?? 0o640;

    // Resolve deterministic directory path conforming to storage-contract.md
    this.instanceDir = resolveSafeLogDirectory(
      fileConfig.directory,
      config.projectId,
      config.environment,
      config.serviceName,
      config.instanceId
    );

    this.ownershipManager = new InstanceOwnershipManager(this.instanceDir, this.fileMode);
    this.initInstanceDirectory();
    this.openCurrentSegment();
  }

  private initInstanceDirectory(): void {
    try {
      if (!fs.existsSync(this.instanceDir)) {
        fs.mkdirSync(this.instanceDir, { recursive: true, mode: this.dirMode });
      }

      // Acquire atomic exclusive single-writer ownership
      this.ownershipManager.acquire();
    } catch (err) {
      emitInternalDiagnostic('DirectoryInitError', `Failed to initialize log directory '${this.instanceDir}'`, err);
      throw err;
    }
  }

  /**
   * Initializes or reopens the active file segment for the current UTC date.
   * Performs partial-line recovery if an existing file contains incomplete fragments.
   */
  private openCurrentSegment(): void {
    const todayStr = formatUtcDate(this.clock());
    const state = resolveActiveFileState(this.instanceDir, todayStr);

    this.currentDateStr = todayStr;
    this.currentPartIndex = state.partIndex;
    this.currentFilename = state.filename;
    const targetPath = state.fullPath;

    // Check existing segment for partial-line corruption or incomplete records
    if (fs.existsSync(targetPath)) {
      const recovery = recoverPartialLine(targetPath, this.instanceDir, todayStr);
      this.currentSizeBytes = recovery.finalSizeBytes;

      // If recovered existing segment already exceeds maxFileSizeBytes, rollover immediately
      if (this.currentSizeBytes >= this.maxFileSizeBytes) {
        this.currentPartIndex++;
        this.currentFilename = buildPartFilename(this.currentDateStr, this.currentPartIndex);
        this.currentSizeBytes = 0;
      }
    } else {
      this.currentSizeBytes = 0;
    }

    const activePath = path.join(this.instanceDir, this.currentFilename);
    try {
      this.currentFd = fs.openSync(activePath, 'a', this.fileMode);
    } catch (err) {
      emitInternalDiagnostic('FileOpenError', `Failed opening active log segment '${activePath}'`, err);
      throw err;
    }
  }

  /**
   * Checks if UTC midnight rollover or size-based rollover criteria are met.
   * Performs seamless segment rotation.
   */
  private checkRotation(eventBytes: number): void {
    const todayStr = formatUtcDate(this.clock());

    // 1. UTC Daily Rotation Check
    if (todayStr !== this.currentDateStr) {
      this.rotate(todayStr, 0);
      return;
    }

    // 2. Size-based Rollover Check
    if (this.currentSizeBytes + eventBytes > this.maxFileSizeBytes && this.currentSizeBytes > 0) {
      this.rotate(this.currentDateStr, this.currentPartIndex + 1);
    }
  }

  private rotate(newDateStr: string, newPartIndex: number): void {
    // Finalize and close current segment
    this.closeCurrentFd();

    this.currentDateStr = newDateStr;
    this.currentPartIndex = newPartIndex;
    this.currentFilename = buildPartFilename(newDateStr, newPartIndex);
    this.currentSizeBytes = 0;

    const newPath = path.join(this.instanceDir, this.currentFilename);

    // If reopening existing file at rotated location, run recovery
    if (fs.existsSync(newPath)) {
      const recovery = recoverPartialLine(newPath, this.instanceDir, newDateStr);
      this.currentSizeBytes = recovery.finalSizeBytes;
    }

    try {
      this.currentFd = fs.openSync(newPath, 'a', this.fileMode);
      emitInternalDiagnostic('Rotation', `Rotated to segment '${this.currentFilename}' in '${this.instanceDir}'`);
    } catch (err) {
      emitInternalDiagnostic('RotationError', `Failed opening rotated segment '${newPath}'`, err);
      throw err;
    }
  }

  private closeCurrentFd(): void {
    if (this.currentFd !== null) {
      try {
        fs.fsyncSync(this.currentFd);
      } catch {
        // Ignore fsync on close if disk error
      }
      try {
        fs.closeSync(this.currentFd);
      } catch {
        // Ignore close error
      }
      this.currentFd = null;
    }
  }

  /**
   * Writes a single formatted JSONL line to the active file segment.
   */
  public async write(level: LogLevel, line: string, bytes: number): Promise<void> {
    if (this.isClosed) return;

    this.checkRotation(bytes);

    if (this.currentFd === null) {
      this.openCurrentSegment();
    }

    if (this.currentFd === null) {
      throw new Error(`Cannot write log event: file descriptor is null for '${this.instanceDir}'`);
    }

    const buf = Buffer.from(line, 'utf-8');
    fs.writeSync(this.currentFd, buf, 0, buf.length);

    this.currentSizeBytes += bytes;
    this.totalEventsWritten++;
    this.totalBytesWritten += bytes;

    // Fsync immediately on critical severities (error, fatal) for crash durability
    if (this.fsyncLevels.has(level)) {
      try {
        fs.fsyncSync(this.currentFd);
        this.totalEventsFsynced++;
      } catch (err) {
        emitInternalDiagnostic('FsyncError', `fsync failed on '${this.currentFilename}'`, err);
      }
    }
  }

  /**
   * Synchronous emergency write for crash handlers or unhandled exceptions.
   * Checks rotation and updates durability metrics.
   */
  public emergencyWrite(level: LogLevel, line: string, bytes: number): void {
    if (this.isClosed) return;

    try {
      this.checkRotation(bytes);

      if (this.currentFd === null) {
        this.openCurrentSegment();
      }
      if (this.currentFd !== null) {
        const buf = Buffer.from(line, 'utf-8');
        fs.writeSync(this.currentFd, buf, 0, buf.length);
        this.currentSizeBytes += bytes;
        this.totalEventsWritten++;
        this.totalBytesWritten += bytes;

        if (this.fsyncLevels.has(level)) {
          try {
            fs.fsyncSync(this.currentFd);
            this.totalEventsFsynced++;
          } catch (err) {
            emitInternalDiagnostic('FsyncError', `fsync failed in emergencyWrite on '${this.currentFilename}'`, err);
          }
        }
      }
    } catch (err) {
      emitInternalDiagnostic('EmergencyWriteError', 'Emergency direct write failed', err);
    }
  }

  public async flush(): Promise<void> {
    if (this.currentFd !== null) {
      try {
        fs.fsyncSync(this.currentFd);
        this.totalEventsFsynced++;
      } catch (err) {
        emitInternalDiagnostic('FlushError', `fsync failed during flush on '${this.currentFilename}'`, err);
      }
    }
  }

  public async close(): Promise<void> {
    if (this.isClosed) return;
    this.isClosed = true;
    this.closeCurrentFd();
    this.ownershipManager.release();
  }

  public getStatus(): TransportStatus {
    return {
      totalEventsWritten: this.totalEventsWritten,
      totalBytesWritten: this.totalBytesWritten,
      totalEventsFsynced: this.totalEventsFsynced,
      currentActiveFile: this.currentFilename ? path.join(this.instanceDir, this.currentFilename) : undefined,
      isClosed: this.isClosed,
    };
  }

  /**
   * Returns internal details useful for testing rotation and file sizes.
   */
  public getInternalState() {
    return {
      instanceDir: this.instanceDir,
      currentDateStr: this.currentDateStr,
      currentPartIndex: this.currentPartIndex,
      currentSizeBytes: this.currentSizeBytes,
      currentFilename: this.currentFilename,
    };
  }
}
