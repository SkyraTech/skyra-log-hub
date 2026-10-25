/**
 * @skyra/log-shipper - Source Spool Discovery
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SpoolFile } from './types.js';
import { assertPathContained } from './path-safety.js';

const SEGMENT_FILE_REGEX = /^(\d{4}-\d{2}-\d{2})\.part-(\d{4})\.jsonl$/;

export class SpoolDiscovery {
  constructor(private readonly roots: readonly string[]) {}

  /**
   * Discovers all eligible JSONL spool files across configured root directories.
   * Returns files in deterministic processing order (finalized segments first).
   */
  public discoverSpoolFiles(): SpoolFile[] {
    const discovered: SpoolFile[] = [];

    for (const root of this.roots) {
      if (!fs.existsSync(root)) continue;

      const resolvedRoot = path.resolve(root);
      this.scanRoot(resolvedRoot, discovered);
    }

    // Sort deterministically:
    // 1. Finalized files before active files
    // 2. By date string ascending
    // 3. By part index ascending
    discovered.sort((a, b) => {
      if (a.isActive !== b.isActive) {
        return a.isActive ? 1 : -1;
      }
      if (a.dateStr !== b.dateStr) {
        return a.dateStr.localeCompare(b.dateStr);
      }
      return a.partIndex - b.partIndex;
    });

    return discovered;
  }

  private scanRoot(root: string, results: SpoolFile[]): void {
    // Expected hierarchy: <root>/<projectId>/<env>/<service>/<instance>/<segment>.jsonl
    let projectEntries: fs.Dirent[];
    try {
      projectEntries = fs.readdirSync(root, { withFileTypes: true });
    } catch {
      return;
    }

    for (const proj of projectEntries) {
      if (!proj.isDirectory() || proj.name.startsWith('.')) continue;
      const projPath = path.join(root, proj.name);

      let envEntries: fs.Dirent[];
      try {
        envEntries = fs.readdirSync(projPath, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const env of envEntries) {
        if (!env.isDirectory() || env.name.startsWith('.')) continue;
        const envPath = path.join(projPath, env.name);

        let serviceEntries: fs.Dirent[];
        try {
          serviceEntries = fs.readdirSync(envPath, { withFileTypes: true });
        } catch {
          continue;
        }

        for (const svc of serviceEntries) {
          if (!svc.isDirectory() || svc.name.startsWith('.')) continue;
          const svcPath = path.join(envPath, svc.name);

          let instanceEntries: fs.Dirent[];
          try {
            instanceEntries = fs.readdirSync(svcPath, { withFileTypes: true });
          } catch {
            continue;
          }

          for (const inst of instanceEntries) {
            if (!inst.isDirectory() || inst.name.startsWith('.')) continue;
            const instPath = path.join(svcPath, inst.name);

            this.scanInstanceDirectory(
              root,
              proj.name,
              env.name,
              svc.name,
              inst.name,
              instPath,
              results
            );
          }
        }
      }
    }
  }

  private scanInstanceDirectory(
    root: string,
    projectId: string,
    environment: string,
    serviceName: string,
    instanceId: string,
    instDir: string,
    results: SpoolFile[]
  ): void {
    let files: fs.Dirent[];
    try {
      files = fs.readdirSync(instDir, { withFileTypes: true });
    } catch {
      return;
    }

    const hasActiveOwner = files.some((f) => f.name === '.instance.owner');

    const matchingFiles: {
      dirent: fs.Dirent;
      dateStr: string;
      partIndex: number;
    }[] = [];

    for (const file of files) {
      if (!file.isFile()) continue;
      const match = SEGMENT_FILE_REGEX.exec(file.name);
      if (!match) continue;

      const dateStr = match[1]!;
      const partIndex = Number.parseInt(match[2]!, 10);

      matchingFiles.push({ dirent: file, dateStr, partIndex });
    }

    if (matchingFiles.length === 0) return;

    // Sort to identify the highest part file for today
    matchingFiles.sort((a, b) => {
      if (a.dateStr !== b.dateStr) return a.dateStr.localeCompare(b.dateStr);
      return a.partIndex - b.partIndex;
    });

    const highest = matchingFiles[matchingFiles.length - 1]!;

    for (const item of matchingFiles) {
      const fullPath = path.join(instDir, item.dirent.name);
      try {
        assertPathContained(fullPath, root);
        const stats = fs.statSync(fullPath);

        // A file is active only if the instance owner lock is present AND it's the highest segment
        const isActive = hasActiveOwner && item === highest;
        const relativeLocator = path.relative(root, fullPath).replace(/\\/g, '/');

        results.push({
          fullPath,
          relativeLocator,
          projectId,
          environment,
          serviceName,
          instanceId,
          dateStr: item.dateStr,
          partIndex: item.partIndex,
          isActive,
          sizeBytes: stats.size,
          mtimeMs: stats.mtimeMs,
        });
      } catch {
        // Skip uncontained or unreadable files
      }
    }
  }
}
