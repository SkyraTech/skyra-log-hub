import * as fs from 'node:fs';
import * as path from 'node:path';

export const PART_FILE_REGEX = /^(\d{4}-\d{2}-\d{2})\.part-(\d{4})\.jsonl$/;

/**
 * Returns strict ISO 8601 UTC date string in 'YYYY-MM-DD' format.
 */
export function formatUtcDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Formats a zero-padded 4-digit segment index (e.g. 0 -> '0000', 1 -> '0001').
 */
export function formatPartIndex(index: number): string {
  const safe = Math.max(0, Math.floor(index));
  return String(safe).padStart(4, '0');
}

/**
 * Builds the canonical part filename: ${YYYY-MM-DD}.part-${PART_INDEX}.jsonl
 */
export function buildPartFilename(dateStr: string, partIndex: number): string {
  return `${dateStr}.part-${formatPartIndex(partIndex)}.jsonl`;
}

/**
 * Parses a candidate filename into date and partIndex if valid.
 */
export function parsePartFilename(filename: string): { dateStr: string; partIndex: number } | null {
  const match = PART_FILE_REGEX.exec(filename);
  if (!match || !match[1] || !match[2]) return null;
  return {
    dateStr: match[1],
    partIndex: parseInt(match[2], 10),
  };
}

export interface ActiveFileState {
  filename: string;
  fullPath: string;
  dateStr: string;
  partIndex: number;
  currentSizeBytes: number;
}

/**
 * Discovers the active part file for a given UTC date inside an instance directory,
 * or determines the initial part index (0000) if no segment exists.
 */
export function resolveActiveFileState(instanceDir: string, targetDateStr: string): ActiveFileState {
  let highestPart = -1;
  let highestFile: string | null = null;
  let currentSizeBytes = 0;

  try {
    if (fs.existsSync(instanceDir)) {
      const files = fs.readdirSync(instanceDir);
      for (const file of files) {
        const parsed = parsePartFilename(file);
        if (parsed && parsed.dateStr === targetDateStr) {
          if (parsed.partIndex > highestPart) {
            highestPart = parsed.partIndex;
            highestFile = file;
          }
        }
      }
    }
  } catch {
    // If directory cannot be read, default to part 0
  }

  const partIndex = highestPart >= 0 ? highestPart : 0;
  const filename = highestFile ?? buildPartFilename(targetDateStr, partIndex);
  const fullPath = path.join(instanceDir, filename);

  try {
    if (fs.existsSync(fullPath)) {
      const stats = fs.statSync(fullPath);
      currentSizeBytes = stats.size;
    }
  } catch {
    currentSizeBytes = 0;
  }

  return {
    filename,
    fullPath,
    dateStr: targetDateStr,
    partIndex,
    currentSizeBytes,
  };
}
