import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';

export interface ManifestVerificationResult {
  readonly status: 'VERIFIED' | 'MISSING' | 'CORRUPT';
  readonly reason?: string;
  readonly actualByteSize?: number;
  readonly actualChecksum?: string;
  readonly manifestChecksum?: string;
}

@Injectable()
export class ManifestVerifierService {
  private readonly logger = new Logger(ManifestVerifierService.name);

  public async verifySegmentAndManifest(
    segmentPath: string,
    expectedChecksum?: string,
    expectedByteSize?: number,
  ): Promise<ManifestVerificationResult> {
    // 1. Verify JSONL segment file exists
    if (!fs.existsSync(segmentPath)) {
      return {
        status: 'MISSING',
        reason: `Segment file does not exist on disk at path: ${segmentPath}`,
      };
    }

    let stats: fs.Stats;
    try {
      stats = fs.statSync(segmentPath);
      if (!stats.isFile()) {
        return {
          status: 'CORRUPT',
          reason: `Target path is not a regular file: ${segmentPath}`,
        };
      }
    } catch (err) {
      return {
        status: 'CORRUPT',
        reason: `Failed to stat segment file: ${String(err)}`,
      };
    }

    const manifestPath = segmentPath.replace(/\.(jsonl|parquet)$/, '.manifest.json');
    let manifestData: Record<string, unknown> | null = null;

    if (fs.existsSync(manifestPath)) {
      try {
        const rawJson = fs.readFileSync(manifestPath, 'utf-8');
        manifestData = JSON.parse(rawJson);
      } catch (err) {
        this.logger.warn(`Failed to parse manifest JSON at ${manifestPath}: ${String(err)}`);
        return {
          status: 'CORRUPT',
          reason: `Malformed manifest JSON at ${manifestPath}`,
        };
      }
    }

    const targetChecksum =
      (manifestData && typeof manifestData['sha256_checksum'] === 'string')
        ? (manifestData['sha256_checksum'] as string)
        : expectedChecksum;

    const targetByteSize =
      (manifestData && typeof manifestData['byte_size'] === 'number')
        ? (manifestData['byte_size'] as number)
        : expectedByteSize;

    // Check size if available
    if (targetByteSize !== undefined && stats.size !== targetByteSize) {
      return {
        status: 'CORRUPT',
        reason: `Segment file size (${stats.size} bytes) does not match expected size (${targetByteSize} bytes)`,
        actualByteSize: stats.size,
      };
    }

    // Check checksum if available
    if (targetChecksum) {
      try {
        const fileBuf = fs.readFileSync(segmentPath);
        const actualChecksum = crypto.createHash('sha256').update(fileBuf).digest('hex');

        if (actualChecksum.toLowerCase() !== targetChecksum.toLowerCase()) {
          this.logger.error(
            `Checksum mismatch for segment ${segmentPath}: actual "${actualChecksum}" vs manifest "${targetChecksum}"`,
          );
          return {
            status: 'CORRUPT',
            reason: `SHA-256 checksum mismatch: actual "${actualChecksum}" vs expected "${targetChecksum}"`,
            actualByteSize: stats.size,
            actualChecksum,
            manifestChecksum: targetChecksum,
          };
        }

        return {
          status: 'VERIFIED',
          actualByteSize: stats.size,
          actualChecksum,
          manifestChecksum: targetChecksum,
        };
      } catch (err) {
        return {
          status: 'CORRUPT',
          reason: `Failed to compute checksum for ${segmentPath}: ${String(err)}`,
        };
      }
    }

    return {
      status: 'VERIFIED',
      actualByteSize: stats.size,
    };
  }
}
