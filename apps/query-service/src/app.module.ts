import { Module, type NestModule, type MiddlewareConsumer } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from './config/config.module.js';
import { MetadataModule } from './metadata/metadata.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { ArchiveDiscoveryModule } from './modules/archive-discovery/archive-discovery.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { SearchModule } from './modules/search/search.module.js';
import { QueryExecutionModule } from './modules/query-execution/query-execution.module.js';
import { ProblemDetailsFilter } from './common/filters/problem-details.filter.js';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware.js';
import { AuditLoggingInterceptor } from './common/interceptors/audit-logging.interceptor.js';

@Module({
  imports: [
    ConfigModule,
    MetadataModule,
    AuditModule,
    AuthModule,
    ArchiveDiscoveryModule,
    HealthModule,
    SearchModule,
    QueryExecutionModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: ProblemDetailsFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditLoggingInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  public configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}

