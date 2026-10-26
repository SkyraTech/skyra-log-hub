import { Module } from '@nestjs/common';
import { QueryExecutionModule } from '../query-execution/query-execution.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { AnalyticsController } from './api/analytics.controller.js';
import { AggregateLogsUseCase } from './application/aggregate-logs.use-case.js';
import { DiscoverFacetsUseCase } from './application/discover-facets.use-case.js';
import { AnalyticsResponseMapper } from './application/analytics-response.mapper.js';
import { AggregateValidationPipe } from './api/pipes/aggregate-validation.pipe.js';
import { FacetsValidationPipe } from './api/pipes/facets-validation.pipe.js';

@Module({
  imports: [QueryExecutionModule, AuthModule, AuditModule],
  controllers: [AnalyticsController],
  providers: [
    AggregateLogsUseCase,
    DiscoverFacetsUseCase,
    AnalyticsResponseMapper,
    AggregateValidationPipe,
    FacetsValidationPipe,
  ],
  exports: [AggregateLogsUseCase, DiscoverFacetsUseCase],
})
export class AnalyticsModule {}
