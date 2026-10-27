import { Injectable, Inject, Logger } from '@nestjs/common';
import type { TrustedArchiveSegmentDescriptor } from '../../archive-discovery/domain/archive-segment-descriptor.model.js';
import type { MaterializationResult } from '../domain/materialization-state.model.js';
import {
  PARQUET_CATALOG_PORT,
  type IParquetCatalogPort,
} from '../domain/parquet-catalog.port.js';
import { DuckDbParquetConverter } from '../infrastructure/duckdb/duckdb-parquet-converter.js';
import { QueryAuditService } from '../../audit/query-audit.service.js';
import { QueryConfigService } from '../../../config/query-config.service.js';

@Injectable()
export class MaterializeSegmentUseCase {
  private readonly logger = new Logger(MaterializeSegmentUseCase.name);
  private readonly activeJobs = new Set<string>();

  constructor(
    @Inject(PARQUET_CATALOG_PORT)
    private readonly catalog: IParquetCatalogPort,
    private readonly converter: DuckDbParquetConverter,
    private readonly audit: QueryAuditService,
    private readonly config: QueryConfigService,
  ) {}

  public async execute(
    canonicalDescriptor: TrustedArchiveSegmentDescriptor,
    correlationId?: string,
  ): Promise<MaterializationResult> {
    if (!this.config.parquetMaterializationEnabled) {
      return {
        success: false,
        jobId: 'disabled',
        canonicalSegmentId: canonicalDescriptor.segmentFilename,
        error: 'Parquet materialization is disabled by configuration.',
        durationMs: 0,
        inputBytes: 0,
        outputBytes: 0,
        recordCount: 0,
      };
    }

    // 1. Idempotency check: Reuse existing valid Parquet if already available
    const existing = await this.catalog.getParquetDescriptor(canonicalDescriptor);
    if (existing && existing.integrityStatus === 'VERIFIED') {
      return {
        success: true,
        jobId: 'reused',
        canonicalSegmentId: canonicalDescriptor.segmentFilename,
        parquetDescriptor: existing,
        durationMs: 0,
        inputBytes: canonicalDescriptor.byteSize,
        outputBytes: existing.byteSize,
        recordCount: existing.recordCount,
      };
    }

    // 2. Concurrency guard: Prevent duplicate concurrent materialization of same segment
    const segmentKey = `${canonicalDescriptor.tenantId}:${canonicalDescriptor.projectId}:${canonicalDescriptor.segmentFilename}`;
    if (this.activeJobs.has(segmentKey)) {
      this.logger.debug(`Materialization job already in progress for ${canonicalDescriptor.segmentFilename}`);
      return {
        success: false,
        jobId: 'concurrent-in-progress',
        canonicalSegmentId: canonicalDescriptor.segmentFilename,
        error: 'Materialization job already in progress.',
        durationMs: 0,
        inputBytes: 0,
        outputBytes: 0,
        recordCount: 0,
      };
    }

    this.activeJobs.add(segmentKey);

    this.audit.recordSecurityEvent({
      eventType: 'PARQUET_MATERIALIZATION_STARTED',
      tenantId: canonicalDescriptor.tenantId,
      projects: [canonicalDescriptor.projectId],
      correlationId,
      detail: `Started Parquet materialization for segment ${canonicalDescriptor.segmentFilename}`,
    });

    try {
      const result = await this.converter.convertSegment(canonicalDescriptor);

      if (result.success && result.parquetDescriptor) {
        this.audit.recordSecurityEvent({
          eventType: 'PARQUET_MATERIALIZATION_COMPLETED',
          tenantId: canonicalDescriptor.tenantId,
          projects: [canonicalDescriptor.projectId],
          correlationId,
          durationMs: result.durationMs,
          detail: `Completed Parquet materialization for ${canonicalDescriptor.segmentFilename}: ${result.recordCount} rows, ${result.outputBytes} bytes (${result.durationMs}ms)`,
        });
      } else {
        this.audit.recordSecurityEvent({
          eventType: 'PARQUET_MATERIALIZATION_FAILED',
          tenantId: canonicalDescriptor.tenantId,
          projects: [canonicalDescriptor.projectId],
          correlationId,
          detail: `Parquet materialization failed for ${canonicalDescriptor.segmentFilename}: ${result.error}`,
        });
      }

      return result;
    } finally {
      this.activeJobs.delete(segmentKey);
    }
  }
}
