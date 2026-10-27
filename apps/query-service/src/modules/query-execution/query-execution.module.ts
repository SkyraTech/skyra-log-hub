import { Module, forwardRef } from '@nestjs/common';
import { ArchiveDiscoveryModule } from '../archive-discovery/archive-discovery.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { ParquetCacheModule } from '../parquet-cache/parquet-cache.module.js';
import { LOG_QUERY_EXECUTION_PORT } from './domain/query-execution.port.js';
import { FilterCompilerService } from './application/filter-compiler.service.js';
import { SqlGeneratorService } from './application/sql-generator.service.js';
import { AnalyticsSqlGeneratorService } from './application/analytics-sql-generator.service.js';
import { QueryPlannerService } from './application/query-planner.service.js';
import { DuckDbInstanceManager } from './infrastructure/duckdb/duckdb-instance.manager.js';
import { QueryResourceGovernorService } from './infrastructure/duckdb/query-resource-governor.service.js';
import { DuckDbLogQueryAdapter } from './infrastructure/duckdb/duckdb-query-adapter.js';

@Module({
  imports: [ArchiveDiscoveryModule, AuthModule, AuditModule, forwardRef(() => ParquetCacheModule)],
  providers: [
    FilterCompilerService,
    SqlGeneratorService,
    AnalyticsSqlGeneratorService,
    QueryPlannerService,
    DuckDbInstanceManager,
    QueryResourceGovernorService,
    DuckDbLogQueryAdapter,
    {
      provide: LOG_QUERY_EXECUTION_PORT,
      useExisting: DuckDbLogQueryAdapter,
    },
  ],
  exports: [
    LOG_QUERY_EXECUTION_PORT,
    DuckDbLogQueryAdapter,
    QueryPlannerService,
    FilterCompilerService,
    SqlGeneratorService,
    AnalyticsSqlGeneratorService,
    DuckDbInstanceManager,
    QueryResourceGovernorService,
  ],
})
export class QueryExecutionModule {}
