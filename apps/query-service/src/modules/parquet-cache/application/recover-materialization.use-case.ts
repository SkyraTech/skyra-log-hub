import * as fs from 'node:fs';
import * as path from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { ParquetPathSafetyService } from '../infrastructure/filesystem/parquet-path-safety.service.js';

export interface RecoveryResult {
  readonly stagedFilesScanned: number;
  readonly stagedFilesRemoved: number;
  readonly errors: readonly string[];
}

@Injectable()
export class RecoverMaterializationUseCase {
  private readonly logger = new Logger(RecoverMaterializationUseCase.name);

  constructor(private readonly pathSafety: ParquetPathSafetyService) {}

  public execute(maxAgeMs: number = 600_000): RecoveryResult {
    let scanned = 0;
    let removed = 0;
    const errors: string[] = [];

    const root = this.pathSafety.getCacheRoot();
    if (!fs.existsSync(root)) {
      return { stagedFilesScanned: 0, stagedFilesRemoved: 0, errors: [] };
    }

    try {
      this.walkDirectory(root, (filePath) => {
        if (filePath.includes('.staging') || filePath.includes('.tmp-conv') || filePath.includes('.tmp-meta')) {
          scanned++;
          try {
            const stat = fs.statSync(filePath);
            const age = Date.now() - stat.mtimeMs;
            if (age >= maxAgeMs) {
              fs.unlinkSync(filePath);
              removed++;
              this.logger.log(`Recovered and removed stale staging artifact: ${filePath}`);
            }
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            errors.push(`Failed to remove stale file ${filePath}: ${msg}`);
          }
        }
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Recovery walk failed: ${msg}`);
    }

    return { stagedFilesScanned: scanned, stagedFilesRemoved: removed, errors };
  }

  private walkDirectory(dir: string, callback: (filePath: string) => void): void {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.resolve(dir, entry.name);
      if (entry.isDirectory()) {
        this.walkDirectory(fullPath, callback);
      } else if (entry.isFile()) {
        callback(fullPath);
      }
    }
  }
}
