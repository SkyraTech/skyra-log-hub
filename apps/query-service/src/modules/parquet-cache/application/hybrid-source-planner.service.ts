import { Injectable, Inject, Logger } from '@nestjs/common';
import type { TrustedArchiveSegmentDescriptor } from '../../archive-discovery/domain/archive-segment-descriptor.model.js';
import type { TrustedParquetSegmentDescriptor } from '../domain/parquet-segment.model.js';
import {
  PARQUET_CATALOG_PORT,
  type IParquetCatalogPort,
} from '../domain/parquet-catalog.port.js';
import { QueryConfigService } from '../../../config/query-config.service.js';
import { QueryAuditService } from '../../audit/query-audit.service.js';
import { ArchiveIntegrityException } from '../../../common/errors/query.errors.js';

export interface PlannedHybridSources {
  readonly canonicalDescriptors: readonly TrustedArchiveSegmentDescriptor[];
  readonly parquetDescriptors: readonly TrustedParquetSegmentDescriptor[];
  readonly totalSegments: number;
  readonly parquetCount: number;
  readonly jsonlCount: number;
}

@Injectable()
export class HybridSourcePlannerService {
  private readonly logger = new Logger(HybridSourcePlannerService.name);

  constructor(
    @Inject(PARQUET_CATALOG_PORT)
    private readonly catalog: IParquetCatalogPort,
    private readonly config: QueryConfigService,
    private readonly audit: QueryAuditService,
  ) {}

  public async planSources(
    descriptors: readonly TrustedArchiveSegmentDescriptor[],
    tenantId?: string,
    projects?: readonly string[],
    correlationId?: string,
  ): Promise<PlannedHybridSources> {
    if (
      !this.config.parquetCacheEnabled ||
      descriptors.length === 0 ||
      this.config.hybridSourceMode === 'jsonl_only'
    ) {
      return {
        canonicalDescriptors: descriptors,
        parquetDescriptors: [],
        totalSegments: descriptors.length,
        parquetCount: 0,
        jsonlCount: descriptors.length,
      };
    }

    const canonicalSelected: TrustedArchiveSegmentDescriptor[] = [];
    const parquetSelected: TrustedParquetSegmentDescriptor[] = [];

    for (const descriptor of descriptors) {
      try {
        const parquet = await this.catalog.getParquetDescriptor(descriptor);
        if (parquet && parquet.integrityStatus === 'VERIFIED') {
          parquetSelected.push(parquet);
        } else if (this.config.hybridSourceMode === 'parquet_only') {
          throw new ArchiveIntegrityException(
            `Parquet-only diagnostic mode rejected: verified Parquet cache is unavailable for segment ${descriptor.segmentFilename}.`,
          );
        } else {
          canonicalSelected.push(descriptor);
          if (this.config.enableAuditLogging) {
            this.audit.recordSecurityEvent({
              eventType: 'HYBRID_QUERY_JSONL_FALLBACK',
              tenantId: tenantId ?? descriptor.tenantId,
              projects: projects ?? [descriptor.projectId],
              correlationId,
              detail: `Falling back to canonical JSONL for segment ${descriptor.segmentFilename} (Parquet unavailable or unverified)`,
            });
          }
        }
      } catch (err: unknown) {
        if (err instanceof ArchiveIntegrityException) {
          throw err;
        }
        if (this.config.hybridSourceMode === 'parquet_only') {
          throw new ArchiveIntegrityException(
            `Parquet-only diagnostic mode rejected: error resolving Parquet cache for segment ${descriptor.segmentFilename}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Error resolving Parquet cache for ${descriptor.segmentFilename}, falling back to JSONL: ${msg}`);
        canonicalSelected.push(descriptor);
      }
    }

    this.audit.recordSecurityEvent({
      eventType: 'HYBRID_QUERY_PLANNED',
      tenantId,
      projects,
      correlationId,
      detail: `Planned hybrid execution: ${parquetSelected.length} Parquet segments, ${canonicalSelected.length} JSONL segments (total: ${descriptors.length})`,
      metadata: {
        totalSegments: descriptors.length,
        parquetCount: parquetSelected.length,
        jsonlCount: canonicalSelected.length,
      },
    });

    return {
      canonicalDescriptors: canonicalSelected,
      parquetDescriptors: parquetSelected,
      totalSegments: descriptors.length,
      parquetCount: parquetSelected.length,
      jsonlCount: canonicalSelected.length,
    };
  }
}
