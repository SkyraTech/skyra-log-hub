import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { emitInternalDiagnostic } from './diagnostics.js';

export class InstanceOwnershipConflictError extends Error {
  readonly existingPid: number;
  readonly instanceDir: string;

  constructor(instanceDir: string, existingPid: number, details?: string) {
    super(
      `Instance ownership conflict: Active process (PID ${existingPid}) holds exclusive ownership of directory '${instanceDir}'. ` +
      `Concurrent processes must not write to the same instance directory (ADR-011 / storage-contract.md). ${details ?? ''}`
    );
    this.name = 'InstanceOwnershipConflictError';
    this.existingPid = existingPid;
    this.instanceDir = instanceDir;
  }
}

export interface LockMetadata {
  pid: number;
  hostname: string;
  timestamp: string;
  lockId: string;
}

/**
 * Checks whether a process with the given PID is actively running.
 * Uses process.kill(pid, 0) which is supported on both Windows and POSIX.
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
 * Parses lock metadata from .instance.owner content.
 */
export function parseLockContent(content: string): LockMetadata | null {
  try {
    const lines = content.split('\n');
    let pid: number | undefined;
    let hostname = '';
    let timestamp = '';
    let lockId = '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('pid=')) {
        pid = parseInt(trimmed.substring(4), 10);
      } else if (trimmed.startsWith('hostname=')) {
        hostname = trimmed.substring(9);
      } else if (trimmed.startsWith('time=')) {
        timestamp = trimmed.substring(5);
      } else if (trimmed.startsWith('lockId=')) {
        lockId = trimmed.substring(7);
      }
    }

    if (pid !== undefined && !Number.isNaN(pid)) {
      return { pid, hostname, timestamp, lockId };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Manages atomic single-writer instance ownership using exclusive file locking.
 * Guarantees compliance with contracts/storage-contract.md.
 */
export class InstanceOwnershipManager {
  private static readonly activeOwnedDirectories = new Set<string>();

  private readonly lockPath: string;
  private isOwned = false;
  private readonly lockId: string;
  private readonly canonicalDir: string;

  constructor(
    private readonly instanceDir: string,
    private readonly fileMode = 0o640
  ) {
    this.canonicalDir = path.resolve(instanceDir);
    this.lockPath = path.join(instanceDir, '.instance.owner');
    this.lockId = `${process.pid}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Atomically acquires exclusive ownership of the instance directory.
   * Throws InstanceOwnershipConflictError if another active process or in-process logger owns it.
   */
  public acquire(): void {
    if (InstanceOwnershipManager.activeOwnedDirectories.has(this.canonicalDir)) {
      throw new InstanceOwnershipConflictError(
        this.instanceDir,
        process.pid,
        'Concurrent logger instance already active in this process for directory.'
      );
    }

    const lockPayload = [
      `pid=${process.pid}`,
      `hostname=${os.hostname()}`,
      `time=${new Date().toISOString()}`,
      `lockId=${this.lockId}`,
    ].join('\n') + '\n';

    const maxRetries = 3;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Attempt atomic exclusive creation: flag 'wx' fails if file already exists
        const fd = fs.openSync(this.lockPath, 'wx', this.fileMode);
        try {
          const buf = Buffer.from(lockPayload, 'utf-8');
          fs.writeSync(fd, buf, 0, buf.length);
          fs.fsyncSync(fd);
        } finally {
          fs.closeSync(fd);
        }
        this.isOwned = true;
        InstanceOwnershipManager.activeOwnedDirectories.add(this.canonicalDir);
        return;
      } catch (err: unknown) {
        const error = err as NodeJS.ErrnoException;
        if (error.code !== 'EEXIST') {
          emitInternalDiagnostic('OwnershipInitError', `Failed opening lock file '${this.lockPath}'`, err);
          throw err;
        }

        // File exists. Inspect existing lock
        let existingLock: LockMetadata | null = null;
        try {
          const content = fs.readFileSync(this.lockPath, 'utf-8');
          existingLock = parseLockContent(content);
        } catch {
          // File may have been removed concurrently, retry loop will attempt recreation
          continue;
        }

        if (existingLock) {
          if (existingLock.pid === process.pid) {
            // Lock was left by prior closed logger in this process
            try {
              fs.unlinkSync(this.lockPath);
              continue;
            } catch {}
          }

          if (isProcessAlive(existingLock.pid)) {
            // Another ACTIVE process owns this directory
            throw new InstanceOwnershipConflictError(this.instanceDir, existingLock.pid);
          }

          // Stale lock detected: process is dead. Safely unlink and retry
          emitInternalDiagnostic(
            'StaleLockDetected',
            `Removing stale ownership lock from dead PID ${existingLock.pid} in '${this.instanceDir}'`
          );
          try {
            fs.unlinkSync(this.lockPath);
          } catch {
            // Ignored if unlinked concurrently
          }
        } else {
          // Corrupt or empty lockfile. Safely remove and retry
          try {
            fs.unlinkSync(this.lockPath);
          } catch {}
        }
      }
    }

    // Exhausted retries while another process holds or races for the lock
    let finalLock: LockMetadata | null = null;
    try {
      const content = fs.readFileSync(this.lockPath, 'utf-8');
      finalLock = parseLockContent(content);
    } catch {}
    throw new InstanceOwnershipConflictError(
      this.instanceDir,
      finalLock ? finalLock.pid : -1,
      'Failed to acquire exclusive lock after multiple attempts.'
    );
  }

  /**
   * Releases the ownership lock if owned by this process.
   */
  public release(): void {
    if (!this.isOwned) return;
    try {
      if (fs.existsSync(this.lockPath)) {
        const content = fs.readFileSync(this.lockPath, 'utf-8');
        const existing = parseLockContent(content);
        // Only remove if this process is the recorded owner
        if (existing && existing.pid === process.pid) {
          fs.unlinkSync(this.lockPath);
        }
      }
    } catch {
      // Ignore cleanup error on shutdown
    } finally {
      this.isOwned = false;
      InstanceOwnershipManager.activeOwnedDirectories.delete(this.canonicalDir);
    }
  }

  public getIsOwned(): boolean {
    return this.isOwned;
  }
}
