import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { Logger } from '@nestjs/common';
import { GatewayException } from '../../common/types/gateway-exception.js';
import { ErrorCode } from '../../common/types/error-code.enum.js';

export interface LockMetadata {
  pid: number;
  hostname: string;
  time: string;
  lockId: string;
}

export class StorageOwnershipConflictError extends GatewayException {
  readonly existingPid: number;
  readonly walDir: string;
  readonly metadata: LockMetadata | null;

  constructor(walDir: string, existingPid: number, metadata: LockMetadata | null) {
    super(
      ErrorCode.STORAGE_NOT_READY,
      `Storage ownership conflict: Active process (PID ${existingPid} on ${metadata?.hostname ?? 'unknown'}) holds exclusive single-writer ownership of journal directory '${walDir}'. Multiple gateway processes cannot write to the same journal domain.`,
      503,
      {
        retryable: false,
        details: [
          { path: 'wal_directory', message: walDir },
          { path: 'existing_pid', message: String(existingPid) },
          { path: 'lock_id', message: metadata?.lockId ?? 'unknown' },
          { path: 'locked_at', message: metadata?.time ?? 'unknown' },
        ],
      },
    );
    this.name = 'StorageOwnershipConflictError';
    this.existingPid = existingPid;
    this.walDir = walDir;
    this.metadata = metadata;
  }
}

/**
 * Checks whether a process with the given PID is actively running.
 * Uses process.kill(pid, 0) which is supported across Windows and POSIX.
 */
export function isProcessAlive(pid: number): boolean {
  if (pid <= 0 || !Number.isInteger(pid)) return false;
  if (pid === process.pid) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException;
    // EPERM means process exists but we lack permission to signal it (it IS alive)
    if (error.code === 'EPERM') {
      return true;
    }
    // ESRCH means process does not exist
    return false;
  }
}

/**
 * Parses lock metadata from .journal.owner content.
 */
export function parseLockContent(content: string): LockMetadata | null {
  try {
    const lines = content.split('\n');
    let pid: number | undefined;
    let hostname = '';
    let time = '';
    let lockId = '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('pid=')) {
        pid = parseInt(trimmed.substring(4), 10);
      } else if (trimmed.startsWith('hostname=')) {
        hostname = trimmed.substring(9);
      } else if (trimmed.startsWith('time=')) {
        time = trimmed.substring(5);
      } else if (trimmed.startsWith('lockId=')) {
        lockId = trimmed.substring(7);
      }
    }

    if (pid !== undefined && !Number.isNaN(pid)) {
      return { pid, hostname, time, lockId };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Manages atomic single-writer instance ownership for WAL and Archive storage domains (ADR-011 / ADR-016).
 * Ensures only one active ingestion gateway worker can write to a physical journal partition.
 */
export class JournalOwnershipManager {
  private readonly logger = new Logger(JournalOwnershipManager.name);
  private readonly lockPath: string;
  private isOwned = false;
  private readonly lockId: string;
  private readonly canonicalDir: string;

  constructor(private readonly walDir: string) {
    this.canonicalDir = path.resolve(walDir);
    this.lockPath = path.join(walDir, '.journal.owner');
    this.lockId = `${process.pid}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Acquires cross-process single-writer exclusive ownership using atomic file creation (O_CREAT | O_EXCL).
   * If a lock exists:
   * - If the owner PID is alive on this host: throws StorageOwnershipConflictError.
   * - If the owner PID is dead: unlinks stale lock, logs diagnostic warning, and acquires ownership.
   */
  public acquireOwnership(): void {
    if (this.isOwned) return;

    if (!fs.existsSync(this.canonicalDir)) {
      fs.mkdirSync(this.canonicalDir, { recursive: true, mode: 0o750 });
    }

    const lockContent = [
      `pid=${process.pid}`,
      `hostname=${os.hostname()}`,
      `time=${new Date().toISOString()}`,
      `lockId=${this.lockId}`,
      `walDir=${this.canonicalDir}`,
    ].join('\n') + '\n';

    try {
      // Atomic exclusive creation
      const fd = fs.openSync(this.lockPath, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY, 0o640);
      try {
        fs.writeFileSync(fd, lockContent);
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      this.isOwned = true;
      this.logger.log(`Acquired exclusive journal directory ownership on '${this.canonicalDir}' (PID ${process.pid}, LockId ${this.lockId})`);
    } catch (err: unknown) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === 'EEXIST') {
        this.handleExistingLock(lockContent);
      } else {
        throw error;
      }
    }
  }

  private handleExistingLock(lockContent: string): void {
    let existingMetadata: LockMetadata | null = null;
    try {
      const existingContent = fs.readFileSync(this.lockPath, 'utf8');
      existingMetadata = parseLockContent(existingContent);
    } catch {
      // File read race or empty lock
    }

    if (existingMetadata) {
      const isAlive = isProcessAlive(existingMetadata.pid);
      const isSameHost = existingMetadata.hostname === os.hostname();

      if (isAlive && isSameHost) {
        this.logger.error(
          `Journal ownership conflict: Active PID ${existingMetadata.pid} holds exclusive ownership of '${this.canonicalDir}'. Aborting initialization.`,
        );
        throw new StorageOwnershipConflictError(this.canonicalDir, existingMetadata.pid, existingMetadata);
      }

      this.logger.warn(
        `Removing stale journal ownership lock from dead PID ${existingMetadata.pid} (locked at ${existingMetadata.time}) on '${this.canonicalDir}'.`,
      );
    } else {
      this.logger.warn(`Removing unreadable/corrupt journal ownership lock on '${this.canonicalDir}'.`);
    }

    // Safely remove stale lock and re-attempt atomic acquisition
    try {
      fs.unlinkSync(this.lockPath);
    } catch (err: unknown) {
      const unlinkErr = err as NodeJS.ErrnoException;
      if (unlinkErr.code !== 'ENOENT') {
        throw unlinkErr;
      }
    }

    const fd = fs.openSync(this.lockPath, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY, 0o640);
    try {
      fs.writeFileSync(fd, lockContent);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    this.isOwned = true;
    this.logger.log(`Acquired exclusive journal ownership on '${this.canonicalDir}' after removing stale lock.`);
  }

  /**
   * Releases exclusive ownership on graceful process shutdown.
   */
  public releaseOwnership(): void {
    if (!this.isOwned) return;

    try {
      if (fs.existsSync(this.lockPath)) {
        const content = fs.readFileSync(this.lockPath, 'utf8');
        const meta = parseLockContent(content);
        // Only unlink if we are the process that created this lock
        if (meta?.pid === process.pid && meta?.lockId === this.lockId) {
          fs.unlinkSync(this.lockPath);
          this.logger.log(`Released journal directory ownership on '${this.canonicalDir}'`);
        }
      }
    } catch (err: unknown) {
      this.logger.warn(`Failed to cleanly release journal ownership lock on '${this.canonicalDir}': ${String(err)}`);
    } finally {
      this.isOwned = false;
    }
  }

  public getStatus(): { isOwned: boolean; lockId: string; pid: number; lockPath: string } {
    return {
      isOwned: this.isOwned,
      lockId: this.lockId,
      pid: process.pid,
      lockPath: this.lockPath,
    };
  }
}
