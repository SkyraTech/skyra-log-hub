import * as fs from 'node:fs';
import * as path from 'node:path';
import { Injectable, Inject, Logger, Optional } from '@nestjs/common';
import {
  ARCHIVE_SEGMENT_REPOSITORY,
  type IArchiveSegmentRepository,
  type ArchiveSegmentRecord,
} from '../../archive-discovery/domain/archive-segment.repository.interface.js';
import type { TrustedArchiveSegmentDescriptor } from '../../archive-discovery/domain/archive-segment-descriptor.model.js';
import { PathSafetyService } from '../../archive-discovery/infrastructure/path-safety.service.js';
import { ManifestVerifierService } from '../../archive-discovery/application/manifest-verifier.service.js';
import {
  PARQUET_CATALOG_PORT,
  type IParquetCatalogPort,
} from '../domain/parquet-catalog.port.js';
import { QueryConfigService } from '../../../config/query-config.service.js';
import { QueryAuditService } from '../../audit/query-audit.service.js';
import { PrismaService } from '../../../metadata/prisma.service.js';
import type { EligibleCompactionSegment } from '../domain/compaction.types.js';

@Injectable()
export class CompactionDiscoveryService {
  private readonly logger = new Logger(CompactionDiscoveryService.name);

  constructor(
    @Inject(ARCHIVE_SEGMENT_REPOSITORY)
    private readonly segmentRepo: IArchiveSegmentRepository,
    @Inject(PARQUET_CATALOG_PORT)
    private readonly parquetCatalog: IParquetCatalogPort,
    private readonly pathSafety: PathSafetyService,
    private readonly manifestVerifier: ManifestVerifierService,
    private readonly config: QueryConfigService,
    private readonly audit: QueryAuditService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  /**
   * Discovers sealed archive segments that are eligible for compaction into Parquet.
   * Filters out already-materialized segments, invalid segments, or segments in archived projects.
   */
  public async discoverEligibleSegments(
    limit = 10,
    correlationId?: string,
  ): Promise<EligibleCompactionSegment[]> {
    const eligible: EligibleCompactionSegment[] = [];

    // 1. First, attempt discovery via ArchiveSegmentRepository (Database or InMemory)
    let records: ArchiveSegmentRecord[] = [];
    try {
      if (typeof this.segmentRepo.findRecentSegments === 'function') {
        records = await this.segmentRepo.findRecentSegments(limit * 3);
      }
    } catch (err: unknown) {
      this.logger.debug(`findRecentSegments query skipped: ${String(err)}`);
    }

    // 2. If repository returned no records, fall back to safe filesystem scanning
    if (records.length === 0) {
      records = await this.discoverFromFilesystem(limit * 3);
    }

    for (const record of records) {
      if (eligible.length >= limit) break;

      try {
        // A. Resolve and validate path containment
        const resolvedPath = this.pathSafety.resolveAndValidateSegmentPath(
          record.tenantId,
          record.projectId,
          record.environment,
          record.serviceName,
          record.date,
          record.segmentFilename,
        );

        // B. Verify segment file and .manifest.json integrity
        const verification = await this.manifestVerifier.verifySegmentAndManifest(
          resolvedPath,
          record.sha256Checksum,
          Number(record.byteSize),
        );

        if (verification.status !== 'VERIFIED') {
          this.logger.debug(`Skipping unverified segment ${record.segmentFilename}: ${verification.reason}`);
          continue;
        }

        const nowIso = new Date().toISOString();
        const descriptor: TrustedArchiveSegmentDescriptor = {
          id: record.id,
          tenantId: record.tenantId,
          projectId: record.projectId,
          environment: record.environment,
          serviceName: record.serviceName,
          date: record.date,
          segmentFilename: record.segmentFilename,
          resolvedPath,
          byteSize: Number(record.byteSize),
          recordCount: record.recordCount,
          sha256Checksum: record.sha256Checksum,
          integrityStatus: 'VERIFIED',
          firstEventTimestamp: record.firstEventTimestamp.toISOString(),
          lastEventTimestamp: record.lastEventTimestamp.toISOString(),
          finalizedAt: record.finalizedAt.toISOString(),
          verifiedAt: nowIso,
        };

        // C. Check if already materialized and verified in Parquet catalog
        const existingParquet = await this.parquetCatalog.getParquetDescriptor(descriptor);
        if (existingParquet && existingParquet.integrityStatus === 'VERIFIED') {
          // Already materialized and verified healthy! Skip
          continue;
        }

        // D. Inspect Project Retention & Legal Hold
        let isLegalHold = false;
        let retentionDays = 30;
        if (this.prisma && !this.config.databaseUrl.includes('REPLACE_ME')) {
          try {
            const retention = await this.prisma.projectRetention.findUnique({
              where: {
                tenantId_projectId: {
                  tenantId: record.tenantId,
                  projectId: record.projectId,
                },
              },
            });
            if (retention) {
              isLegalHold = retention.isLegalHold;
              retentionDays = retention.retentionDays;
            }
          } catch {
            // Ignore DB lookup error, retain defaults
          }
        }

        // If configured to defer legal hold segments, defer with audit log
        if (isLegalHold && this.config.compactionDeferLegalHold) {
          this.audit.recordSecurityEvent({
            eventType: 'COMPACTION_LEGAL_HOLD_DEFERRED',
            tenantId: record.tenantId,
            projects: [record.projectId],
            correlationId,
            detail: `Segment ${record.segmentFilename} deferred: legal hold active for project ${record.projectId}`,
          });
          continue;
        }

        eligible.push({
          descriptor,
          isLegalHold,
          retentionDays,
          reason: 'UNMATERIALIZED',
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.debug(`Error checking segment eligibility for ${record.segmentFilename}: ${msg}`);
      }
    }

    return eligible;
  }

  /**
   * Filesystem discovery fallback: walks archiveRoot safely to find sealed segments with .manifest.json.
   */
  public async discoverFromFilesystem(maxRecords = 50): Promise<ArchiveSegmentRecord[]> {
    const archiveRoot = path.resolve(this.config.archiveRoot);
    if (!fs.existsSync(archiveRoot)) return [];

    const discovered: ArchiveSegmentRecord[] = [];
    const budget = { remaining: 500 };

    this.walkArchiveDir(archiveRoot, (manifestPath) => {
      if (discovered.length >= maxRecords) return;
      try {
        const raw = fs.readFileSync(manifestPath, 'utf8');
        const manifest = JSON.parse(raw);
        if (
          manifest.manifest_version === '1.0' &&
          manifest.tenant_id &&
          manifest.project_id &&
          manifest.environment &&
          manifest.service_name &&
          manifest.date &&
          manifest.segment_filename &&
          manifest.sha256_checksum &&
          typeof manifest.record_count === 'number' &&
          typeof manifest.byte_size === 'number'
        ) {
          discovered.push({
            id: `fs-${manifest.tenant_id}-${manifest.project_id}-${manifest.segment_filename}`,
            tenantId: manifest.tenant_id,
            projectId: manifest.project_id,
            environment: manifest.environment,
            serviceName: manifest.service_name,
            date: manifest.date,
            segmentFilename: manifest.segment_filename,
            recordCount: manifest.record_count,
            byteSize: manifest.byte_size,
            sha256Checksum: manifest.sha256_checksum,
            firstEventTimestamp: new Date(manifest.first_event_timestamp || manifest.finalized_at || Date.now()),
            lastEventTimestamp: new Date(manifest.last_event_timestamp || manifest.finalized_at || Date.now()),
            finalizedAt: new Date(manifest.finalized_at || Date.now()),
            writerInstanceId: manifest.writer_instance_id || 'unknown',
            journalSegmentId: manifest.journal_commit_range?.segment_id || 'unknown',
            journalStartOffset: BigInt(manifest.journal_commit_range?.start_offset ?? 0),
            journalEndOffset: BigInt(manifest.journal_commit_range?.end_offset ?? 0),
          });
        }
      } catch {
        // Ignore unparseable manifest
      }
    }, budget, 0);

    return discovered;
  }

  private walkArchiveDir(
    dir: string,
    onManifest: (manifestPath: string) => void,
    budget: { remaining: number },
    depth: number,
  ): void {
    if (depth > 8) return;
    if (!fs.existsSync(dir)) return;
    if (fs.lstatSync(dir).isSymbolicLink()) return;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (--budget.remaining < 0) return;
      if (entry.isSymbolicLink()) continue;

      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        this.walkArchiveDir(fullPath, onManifest, budget, depth + 1);
      } else if (entry.isFile() && entry.name.endsWith('.manifest.json')) {
        onManifest(fullPath);
      }
    }
  }
}
