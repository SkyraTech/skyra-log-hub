import { Injectable, Inject, Logger, forwardRef } from '@nestjs/common';
import type { TrustedArchiveSegmentDescriptor } from '../../archive-discovery/domain/archive-segment-descriptor.model.js';
import type { TrustedParquetSegmentDescriptor } from '../domain/parquet-segment.model.js';
import {
  PARQUET_CATALOG_PORT,
  type IParquetCatalogPort,
} from '../domain/parquet-catalog.port.js';
import { DuckDbInstanceManager } from '../../query-execution/infrastructure/duckdb/duckdb-instance.manager.js';

export interface VerifyParquetResult {
  readonly isValid: boolean;
  readonly descriptor?: TrustedParquetSegmentDescriptor;
  readonly reason?: string;
}

@Injectable()
export class VerifyParquetUseCase {
  private readonly logger = new Logger(VerifyParquetUseCase.name);

  constructor(
    @Inject(PARQUET_CATALOG_PORT)
    private readonly catalog: IParquetCatalogPort,
    @Inject(forwardRef(() => DuckDbInstanceManager))
    private readonly instanceManager: DuckDbInstanceManager,
  ) {}

  public async execute(
    canonicalDescriptor: TrustedArchiveSegmentDescriptor,
  ): Promise<VerifyParquetResult> {
    const descriptor = await this.catalog.getParquetDescriptor(canonicalDescriptor);
    if (!descriptor) {
      return { isValid: false, reason: 'Parquet descriptor not found or not in READY state.' };
    }

    // Verify DuckDB can actually read the file without corruption
    try {
      const conn = await this.instanceManager.createConnection();
      try {
        const normalized = descriptor.resolvedPath.replace(/\\/g, '/');
        const reader = await conn.run(`SELECT CAST(count(*) AS BIGINT) FROM read_parquet(['${normalized}'])`);
        const rows = await reader.getRows();
        const count = Number(rows[0]?.[0] ?? 0);

        if (count !== canonicalDescriptor.recordCount) {
          return {
            isValid: false,
            reason: `Record count mismatch: expected ${canonicalDescriptor.recordCount}, found ${count}.`,
          };
        }

        return { isValid: true, descriptor };
      } finally {
        try {
          conn.closeSync();
        } catch {
          // ignore
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`DuckDB failed to read Parquet file ${descriptor.resolvedPath}: ${msg}`);
      return { isValid: false, reason: `DuckDB read error: ${msg}` };
    }
  }
}
