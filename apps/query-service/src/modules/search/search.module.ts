import { Module } from '@nestjs/common';
import { SearchController } from './search.controller.js';
import { AuthModule } from '../auth/auth.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { QueryExecutionModule } from '../query-execution/query-execution.module.js';
import { ConfigModule } from '../../config/config.module.js';
import { CursorCodecService } from './application/cursor-codec.service.js';
import { SearchResponseMapper } from './application/search-response.mapper.js';
import { SearchLogsUseCase } from './application/search-logs.use-case.js';
import { GetLogEventUseCase } from './application/get-log-event.use-case.js';
import { SearchValidationPipe } from './api/pipes/search-validation.pipe.js';
import { EventLookupValidationPipe } from './api/pipes/event-lookup-validation.pipe.js';

@Module({
  imports: [
    ConfigModule,
    AuthModule,
    AuditModule,
    QueryExecutionModule,
  ],
  controllers: [SearchController],
  providers: [
    CursorCodecService,
    SearchResponseMapper,
    SearchLogsUseCase,
    GetLogEventUseCase,
    SearchValidationPipe,
    EventLookupValidationPipe,
  ],
  exports: [
    SearchLogsUseCase,
    GetLogEventUseCase,
    CursorCodecService,
    SearchResponseMapper,
  ],
})
export class SearchModule {}
