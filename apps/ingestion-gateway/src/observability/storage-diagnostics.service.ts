import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { Injectable, Inject, Logger } from '@nestjs/common';
import { WalJournalService } from '../storage/wal/wal-journal.service.js';
import { deserializeWalFrame, WAL_OVERHEAD_SIZE } from '../storage/wal/wal-frame.js';
import {
  RECEIPT_REPOSITORY,
  type IReceiptRepository,
} from '../metadata/repositories/receipt.repository.interface.js';

export interface WalSegmentInspection {
  segmentFilename: string;
  fileSizeBytes: number;
  validFrameCount: number;
  hasCorruptFrames: boolean;
  errors: string[];
}

export interface ManifestVerificationResult {
  valid: boolean;
  segmentFilename: string;
  expectedChecksum: string;
  computedChecksum: string;
  error?: string;
}

@Injectable()
export class StorageDiagnosticsService {
  private readonly logger = new Logger(StorageDiagnosticsService.name);

  constructor(
    private readonly walService: WalJournalService,
    @Inject(RECEIPT_REPOSITORY)
    private readonly receiptRepo: IReceiptRepository,
  ) {}

  /**
   * Safe read-only inspection of all physical WAL segments in the journal directory.
   */
  public inspectWalDirectory(walDir = this.walService.getStatus().walDir): WalSegmentInspection[] {
    if (!fs.existsSync(walDir)) return [];

    const files = fs.readdirSync(walDir).filter((f) => f.endsWith('.wal'));
    const results: WalSegmentInspection[] = [];

    for (const filename of files) {
      const filePath = path.join(walDir, filename);
      const stat = fs.statSync(filePath);
      const buf = fs.readFileSync(filePath);
      let offset = 0;
      let validCount = 0;
      const errors: string[] = [];

      while (offset < buf.length) {
        if (buf.length - offset < WAL_OVERHEAD_SIZE) {
          errors.push(`Incomplete trailing header (${buf.length - offset} bytes) at offset ${offset}`);
          break;
        }

        const res = deserializeWalFrame(buf.subarray(offset), offset);
        if (!res.valid) {
          errors.push(`Corrupt frame at offset ${offset}: ${res.error}`);
          break;
        }

        validCount++;
        offset += res.bytesConsumed;
      }

      results.push({
        segmentFilename: filename,
        fileSizeBytes: stat.size,
        validFrameCount: validCount,
        hasCorruptFrames: errors.length > 0,
        errors,
      });
    }

    return results;
  }

  /**
   * Verifies an archive segment manifest against its physical JSONL data file.
   */
  public verifyArchiveManifest(manifestPath: string): ManifestVerificationResult {
    if (!fs.existsSync(manifestPath)) {
      return {
        valid: false,
        segmentFilename: '',
        expectedChecksum: '',
        computedChecksum: '',
        error: `Manifest file not found: ${manifestPath}`,
      };
    }

    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const dir = path.dirname(manifestPath);
      const segmentPath = path.join(dir, manifest.segment_filename);

      if (!fs.existsSync(segmentPath)) {
        return {
          valid: false,
          segmentFilename: manifest.segment_filename,
          expectedChecksum: manifest.sha256_checksum,
          computedChecksum: '',
          error: `Underlying segment JSONL file not found: ${segmentPath}`,
        };
      }

      const fileBuf = fs.readFileSync(segmentPath);
      const computed = crypto.createHash('sha256').update(fileBuf).digest('hex');

      return {
        valid: computed === manifest.sha256_checksum,
        segmentFilename: manifest.segment_filename,
        expectedChecksum: manifest.sha256_checksum,
        computedChecksum: computed,
        error: computed !== manifest.sha256_checksum ? 'Checksum mismatch between JSONL and manifest' : undefined,
      };
    } catch (err: unknown) {
      return {
        valid: false,
        segmentFilename: '',
        expectedChecksum: '',
        computedChecksum: '',
        error: `Failed to parse manifest: ${String(err)}`,
      };
    }
  }

  /**
   * Returns current single-writer ownership status.
   */
  public getOwnershipStatus() {
    return this.walService.getStatus().owner;
  }
}
