import { Module, forwardRef } from '@nestjs/common';
import { PARQUET_CATALOG_PORT } from './domain/parquet-catalog.port.js';
import { FileParquetCatalogService } from './infrastructure/catalog/file-parquet-catalog.service.js';
import { ParquetPathSafetyService } from './infrastructure/filesystem/parquet-path-safety.service.js';
import { DuckDbParquetConverter } from './infrastructure/duckdb/duckdb-parquet-converter.js';
import { MaterializeSegmentUseCase } from './application/materialize-segment.use-case.js';
import { VerifyParquetUseCase } from './application/verify-parquet.use-case.js';
import { RecoverMaterializationUseCase } from './application/recover-materialization.use-case.js';
import { HybridSourcePlannerService } from './application/hybrid-source-planner.service.js';
import { CompactionLockCoordinatorService } from './application/compaction-lock-coordinator.service.js';
import { CompactionDiscoveryService } from './application/compaction-discovery.service.js';
import { BackgroundCompactionService } from './application/background-compaction.service.js';
import { QueryExecutionModule } from '../query-execution/query-execution.module.js';
import { ArchiveDiscoveryModule } from '../archive-discovery/archive-discovery.module.js';
import { MetadataModule } from '../../metadata/metadata.module.js';
import { AuditModule } from '../audit/audit.module.js';

@Module({
  imports: [
    forwardRef(() => QueryExecutionModule),
    forwardRef(() => ArchiveDiscoveryModule),
    MetadataModule,
    AuditModule,
  ],
  providers: [
    ParquetPathSafetyService,
    FileParquetCatalogService,
    {
      provide: PARQUET_CATALOG_PORT,
      useClass: FileParquetCatalogService,
    },
    DuckDbParquetConverter,
    MaterializeSegmentUseCase,
    VerifyParquetUseCase,
    RecoverMaterializationUseCase,
    HybridSourcePlannerService,
    CompactionLockCoordinatorService,
    CompactionDiscoveryService,
    BackgroundCompactionService,
  ],
  exports: [
    PARQUET_CATALOG_PORT,
    ParquetPathSafetyService,
    FileParquetCatalogService,
    DuckDbParquetConverter,
    MaterializeSegmentUseCase,
    VerifyParquetUseCase,
    RecoverMaterializationUseCase,
    HybridSourcePlannerService,
    CompactionLockCoordinatorService,
    CompactionDiscoveryService,
    BackgroundCompactionService,
  ],
})
export class ParquetCacheModule {}
