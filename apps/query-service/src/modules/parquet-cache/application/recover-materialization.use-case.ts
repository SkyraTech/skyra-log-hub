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
            // Age does not establish ownership or prove the converter is dead.
            // Preserve unknown jobs; only the creating converter cleans its own staging.
            void maxAgeMs;
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            errors.push(`Failed to remove stale file ${filePath}: ${msg}`);
          }
        }
      }, { remaining: 4096 }, 0);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Recovery walk failed: ${msg}`);
    }

    return { stagedFilesScanned: scanned, stagedFilesRemoved: removed, errors };
  }

  private walkDirectory(dir: string, callback: (filePath: string) => void, budget: {remaining:number}, depth:number): void {
    if(depth>16)throw Error('Derived staging scan depth bound reached');
    if (!fs.existsSync(dir)) return;
    if(fs.lstatSync(dir).isSymbolicLink())throw Error('Redirected derived staging root preserved');
    const directory=fs.opendirSync(dir);
    try{let entry;while((entry=directory.readSync())){
      if(--budget.remaining<0)throw Error('Derived staging scan entry bound reached');
      const fullPath=path.resolve(dir,entry.name);
      if(entry.isSymbolicLink())continue;
      if(entry.isDirectory())this.walkDirectory(fullPath,callback,budget,depth+1);
      else if(entry.isFile())callback(fullPath);
    }}finally{directory.closeSync();}
  }
}
