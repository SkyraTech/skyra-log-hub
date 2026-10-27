import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import type { IParquetCatalogPort } from '../../domain/parquet-catalog.port.js';
import type { TrustedArchiveSegmentDescriptor } from '../../../archive-discovery/domain/archive-segment-descriptor.model.js';
import type {
  DerivedParquetMetadata,
  TrustedParquetSegmentDescriptor,
} from '../../domain/parquet-segment.model.js';
import { ParquetPathSafetyService } from '../filesystem/parquet-path-safety.service.js';
import { QueryConfigService } from '../../../../config/query-config.service.js';
import { QueryAuditService } from '../../../audit/query-audit.service.js';

@Injectable()
export class FileParquetCatalogService implements IParquetCatalogPort {
  private readonly logger = new Logger(FileParquetCatalogService.name);

  constructor(
    private readonly pathSafety: ParquetPathSafetyService,
    private readonly config: QueryConfigService,
    private readonly audit: QueryAuditService,
  ) {}

  public async getParquetDescriptor(
    canonicalDescriptor: TrustedArchiveSegmentDescriptor,
  ): Promise<TrustedParquetSegmentDescriptor | null> {
    if (!this.config.parquetCacheEnabled) {
      return null;
    }

    try {
      const paths = this.pathSafety.resolveSegmentPaths(
        canonicalDescriptor.tenantId,
        canonicalDescriptor.projectId,
        canonicalDescriptor.environment,
        canonicalDescriptor.date,
        canonicalDescriptor.segmentFilename,
      );

      if (!fs.existsSync(paths.metadataPath) || !fs.existsSync(paths.parquetPath)) {
        return null;
      }

      const rawMeta = fs.readFileSync(paths.metadataPath, 'utf8');
      const meta = JSON.parse(rawMeta) as DerivedParquetMetadata;

      // Invariant: Only 'READY' state is eligible for query planning
      if (meta.state !== 'READY') {
        return null;
      }

      // Invariant: Source canonical checksum must match descriptor checksum
      if (meta.sourceChecksum !== canonicalDescriptor.sha256Checksum) {
        this.logger.warn(
          `Parquet cache invalidation: source checksum mismatch for ${canonicalDescriptor.segmentFilename} (cache: ${meta.sourceChecksum}, canonical: ${canonicalDescriptor.sha256Checksum})`,
        );
        this.audit.recordSecurityEvent({
          eventType: 'PARQUET_CACHE_INVALIDATED',
          tenantId: canonicalDescriptor.tenantId,
          projects: [canonicalDescriptor.projectId],
          detail: `Source checksum drifted for ${canonicalDescriptor.segmentFilename}`,
        });
        await this.invalidateSegment(
          canonicalDescriptor.tenantId,
          canonicalDescriptor.projectId,
          canonicalDescriptor.environment,
          canonicalDescriptor.date,
          canonicalDescriptor.segmentFilename,
          'SOURCE_CHECKSUM_DRIFT',
        );
        return null;
      }

      // Check physical file stats
      const stat = fs.statSync(paths.parquetPath);
      if (stat.size !== meta.parquetByteSize) {
        this.logger.warn(
          `Parquet cache corruption: size mismatch for ${paths.parquetPath} (expected ${meta.parquetByteSize}, found ${stat.size})`,
        );
        this.audit.recordSecurityEvent({
          eventType: 'PARQUET_CACHE_VERIFICATION_FAILED',
          tenantId: canonicalDescriptor.tenantId,
          projects: [canonicalDescriptor.projectId],
          detail: `Parquet byte size mismatch for ${canonicalDescriptor.segmentFilename}`,
        });
        return null;
      }

      // Optional cryptographic verification if configured
      if (this.config.parquetVerifyChecksums) {
        const fileBuffer = fs.readFileSync(paths.parquetPath);
        const actualSha = crypto.createHash('sha256').update(fileBuffer).digest('hex');
        if (actualSha !== meta.parquetSha256Checksum) {
          this.logger.warn(
            `Parquet cache corruption: SHA-256 mismatch for ${paths.parquetPath} (expected ${meta.parquetSha256Checksum}, calculated ${actualSha})`,
          );
          this.audit.recordSecurityEvent({
            eventType: 'PARQUET_CACHE_VERIFICATION_FAILED',
            tenantId: canonicalDescriptor.tenantId,
            projects: [canonicalDescriptor.projectId],
            detail: `Parquet SHA-256 checksum mismatch for ${canonicalDescriptor.segmentFilename}`,
          });
          return null;
        }
      }

      return {
        id: `pq-${canonicalDescriptor.id}`,
        canonicalSegmentId: canonicalDescriptor.segmentFilename,
        tenantId: canonicalDescriptor.tenantId,
        projectId: canonicalDescriptor.projectId,
        environment: canonicalDescriptor.environment,
        date: canonicalDescriptor.date,
        segmentFilename: canonicalDescriptor.segmentFilename,
        parquetFilename: meta.parquetFilename,
        resolvedPath: paths.parquetPath,
        byteSize: meta.parquetByteSize,
        recordCount: meta.parquetRecordCount,
        sha256Checksum: meta.parquetSha256Checksum,
        sourceChecksum: meta.sourceChecksum,
        materializationVersion: meta.materializationVersion,
        integrityStatus: 'VERIFIED',
        verifiedAt: new Date().toISOString(),
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to inspect Parquet catalog for ${canonicalDescriptor.segmentFilename}: ${msg}`);
      return null;
    }
  }

  public async recordMaterialization(metadata: DerivedParquetMetadata): Promise<void> {
    const paths = this.pathSafety.resolveSegmentPaths(
      metadata.sourceTenantId,
      metadata.sourceProjectId,
      metadata.sourceEnvironment,
      metadata.sourcePartitionDate,
      metadata.sourceSegmentId,
    );

    this.pathSafety.ensureDirectoryExists(paths.directory);
    fs.writeFileSync(paths.metadataPath, JSON.stringify(metadata, null, 2), 'utf8');
  }

  public async invalidateSegment(
    tenantId: string,
    projectId: string,
    environment: string,
    date: string,
    segmentFilename: string,
    reason: string,
  ): Promise<void> {
    try {
      const paths = this.pathSafety.resolveSegmentPaths(tenantId, projectId, environment, date, segmentFilename);
      if (fs.existsSync(paths.metadataPath)) {
        const raw = fs.readFileSync(paths.metadataPath, 'utf8');
        const meta = JSON.parse(raw) as DerivedParquetMetadata;
        const updated = {
          ...meta,
          state: 'INVALID' as const,
          invalidationReason: reason,
          invalidatedAt: new Date().toISOString(),
        };
        fs.writeFileSync(paths.metadataPath, JSON.stringify(updated, null, 2), 'utf8');
      }
      if (fs.existsSync(paths.parquetPath)) {
        fs.unlinkSync(paths.parquetPath);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to invalidate Parquet segment ${segmentFilename}: ${msg}`);
    }
  }

  public async purgeSegment(
    tenantId: string,
    projectId: string,
    environment: string,
    date: string,
    segmentFilename: string,
  ): Promise<void> {
    try {
      const paths = this.pathSafety.resolveSegmentPaths(tenantId, projectId, environment, date, segmentFilename);
      if (fs.existsSync(paths.metadataPath)) {
        fs.unlinkSync(paths.metadataPath);
      }
      if (fs.existsSync(paths.parquetPath)) {
        fs.unlinkSync(paths.parquetPath);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to purge Parquet segment ${segmentFilename}: ${msg}`);
    }
  }
}
