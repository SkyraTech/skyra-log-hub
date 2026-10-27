import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { DuckDbInstanceManager } from '../../../query-execution/infrastructure/duckdb/duckdb-instance.manager.js';
import type { TrustedArchiveSegmentDescriptor } from '../../../archive-discovery/domain/archive-segment-descriptor.model.js';
import type {
  DerivedParquetMetadata,
  TrustedParquetSegmentDescriptor,
} from '../../domain/parquet-segment.model.js';
import type { MaterializationResult } from '../../domain/materialization-state.model.js';
import { ParquetPathSafetyService } from '../filesystem/parquet-path-safety.service.js';

@Injectable()
export class DuckDbParquetConverter {
  private readonly logger = new Logger(DuckDbParquetConverter.name);

  constructor(
    @Inject(forwardRef(() => DuckDbInstanceManager))
    private readonly instanceManager: DuckDbInstanceManager,
    private readonly pathSafety: ParquetPathSafetyService,
  ) {}

  public async convertSegment(
    canonicalDescriptor: TrustedArchiveSegmentDescriptor,
    jobId?: string,
  ): Promise<MaterializationResult> {
    const startTimeNs = process.hrtime.bigint();
    const effectiveJobId = jobId ?? crypto.randomUUID();

    const paths = this.pathSafety.resolveSegmentPaths(
      canonicalDescriptor.tenantId,
      canonicalDescriptor.projectId,
      canonicalDescriptor.environment,
      canonicalDescriptor.date,
      canonicalDescriptor.segmentFilename,
      effectiveJobId,
    );

    this.pathSafety.ensureDirectoryExists(paths.directory);
    this.pathSafety.ensureDirectoryExists(paths.stagingDirectory);

    const normalizedSource = canonicalDescriptor.resolvedPath.replace(/\\/g, '/');
    const normalizedStagingParquet = paths.stagingParquetPath.replace(/\\/g, '/');

    const conn = await this.instanceManager.createConnection();

    try {
      // 1. Convert JSONL -> Staging Parquet
      const copySql = `
        COPY (
          SELECT
            json_extract_string(json, '$."@timestamp"') AS "@timestamp",
            json_extract_string(json, '$.event.id') AS "event.id",
            regexp_extract(filename, '([^/\\\\]+)$', 1) AS "segment_id",
            CAST(row_number() OVER (
              PARTITION BY filename 
              ORDER BY 
                json_extract_string(json, '$."@timestamp"'), 
                json_extract_string(json, '$.event.id'), 
                md5(json)
            ) - 1 AS BIGINT) AS "record_offset",
            json_extract_string(json, '$.skyra.tenant_id') AS "tenant_id",
            json_extract_string(json, '$.skyra.project_id') AS "project_id",
            COALESCE(json_extract_string(json, '$.service.environment'), json_extract_string(json, '$.skyra.environment')) AS "environment",
            json_extract_string(json, '$.service.name') AS "service_name",
            json_extract_string(json, '$.log.level') AS "log_level",
            json_extract_string(json, '$.event.action') AS "event_action",
            json
          FROM read_ndjson_objects(['${normalizedSource}'], filename=true)
        ) TO '${normalizedStagingParquet}' (FORMAT PARQUET, COMPRESSION ZSTD);
      `;

      await conn.run(copySql);

      // 2. Parquet Verification: Compare row counts
      const countReader = await conn.run(`SELECT CAST(count(*) AS BIGINT) FROM read_parquet(['${normalizedStagingParquet}'])`);
      const countRows = await countReader.getRows();
      const parquetCount = Number(countRows[0]?.[0] ?? 0);

      if (parquetCount !== canonicalDescriptor.recordCount) {
        throw new Error(
          `Parquet row count mismatch for ${canonicalDescriptor.segmentFilename}: expected ${canonicalDescriptor.recordCount}, produced ${parquetCount}`,
        );
      }

      // 3. Compute Parquet checksum and byte size
      const stagingStat = fs.statSync(paths.stagingParquetPath);
      const stagingBuf = fs.readFileSync(paths.stagingParquetPath);
      const parquetSha = crypto.createHash('sha256').update(stagingBuf).digest('hex');

      // 4. Construct derived manifest
      const baseName = canonicalDescriptor.segmentFilename.replace(/\.jsonl$/i, '');
      const metadata: DerivedParquetMetadata = {
        manifestVersion: '1.0',
        materializationVersion: '1.0',
        generationId: effectiveJobId,
        sourceSegmentId: canonicalDescriptor.segmentFilename,
        sourceTenantId: canonicalDescriptor.tenantId,
        sourceProjectId: canonicalDescriptor.projectId,
        sourceEnvironment: canonicalDescriptor.environment,
        sourcePartitionDate: canonicalDescriptor.date,
        sourceChecksum: canonicalDescriptor.sha256Checksum,
        sourceByteSize: canonicalDescriptor.byteSize,
        sourceRecordCount: canonicalDescriptor.recordCount,
        parquetFilename: `${baseName}.parquet`,
        parquetSha256Checksum: parquetSha,
        parquetByteSize: stagingStat.size,
        parquetRecordCount: parquetCount,
        state: 'READY',
        locatorScheme: 'deterministic_multi_key_v1',
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };

      fs.writeFileSync(paths.stagingMetadataPath, JSON.stringify(metadata, null, 2), 'utf8');

      // 5. Atomic Publication
      this.atomicPublish(paths.stagingParquetPath, paths.parquetPath);
      this.atomicPublish(paths.stagingMetadataPath, paths.metadataPath);

      const durationMs = Number(process.hrtime.bigint() - startTimeNs) / 1_000_000;

      const descriptor: TrustedParquetSegmentDescriptor = {
        id: `pq-${canonicalDescriptor.id}`,
        canonicalSegmentId: canonicalDescriptor.segmentFilename,
        tenantId: canonicalDescriptor.tenantId,
        projectId: canonicalDescriptor.projectId,
        environment: canonicalDescriptor.environment,
        date: canonicalDescriptor.date,
        segmentFilename: canonicalDescriptor.segmentFilename,
        parquetFilename: metadata.parquetFilename,
        resolvedPath: paths.parquetPath,
        byteSize: metadata.parquetByteSize,
        recordCount: metadata.parquetRecordCount,
        sha256Checksum: metadata.parquetSha256Checksum,
        sourceChecksum: metadata.sourceChecksum,
        materializationVersion: metadata.materializationVersion,
        integrityStatus: 'VERIFIED',
        verifiedAt: metadata.completedAt,
      };

      return {
        success: true,
        jobId: effectiveJobId,
        canonicalSegmentId: canonicalDescriptor.segmentFilename,
        parquetDescriptor: descriptor,
        durationMs: Math.round(durationMs),
        inputBytes: canonicalDescriptor.byteSize,
        outputBytes: stagingStat.size,
        recordCount: parquetCount,
      };
    } catch (err: unknown) {
      this.cleanupStagingFiles(paths.stagingParquetPath, paths.stagingMetadataPath);
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Parquet materialization failed for ${canonicalDescriptor.segmentFilename}: ${msg}`);
      const durationMs = Number(process.hrtime.bigint() - startTimeNs) / 1_000_000;
      return {
        success: false,
        jobId: effectiveJobId,
        canonicalSegmentId: canonicalDescriptor.segmentFilename,
        error: msg,
        durationMs: Math.round(durationMs),
        inputBytes: canonicalDescriptor.byteSize,
        outputBytes: 0,
        recordCount: 0,
      };
    } finally {
      try {
        conn.closeSync();
      } catch {
        // ignore
      }
    }
  }

  private atomicPublish(stagingPath: string, finalPath: string): void {
    if (fs.existsSync(finalPath)) {
      try {
        fs.unlinkSync(finalPath);
      } catch {
        // ignore
      }
    }
    fs.renameSync(stagingPath, finalPath);
  }

  private cleanupStagingFiles(parquetPath: string, metadataPath: string): void {
    try {
      if (fs.existsSync(parquetPath)) fs.unlinkSync(parquetPath);
      if (fs.existsSync(metadataPath)) fs.unlinkSync(metadataPath);
    } catch {
      // ignore
    }
  }

  /**
   * Scans a staging directory and purges stale intermediate files older than maxAgeMs (crash recovery).
   */
  public cleanupOrphanedStagingFiles(stagingDir: string, maxAgeMs = 3600000): number {
    let purged = 0;
    try {
      if (!fs.existsSync(stagingDir)) {
        return 0;
      }
      const files = fs.readdirSync(stagingDir);
      const now = Date.now();
      for (const file of files) {
        const fullPath = path.join(stagingDir, file);
        try {
          const stat = fs.statSync(fullPath);
          if (now - stat.mtimeMs > maxAgeMs) {
            fs.unlinkSync(fullPath);
            purged++;
          }
        } catch {
          // ignore concurrent worker delete
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to cleanup orphaned staging directory ${stagingDir}: ${msg}`);
    }
    return purged;
  }
}

