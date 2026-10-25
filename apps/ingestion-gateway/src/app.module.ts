import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module.js';
import { MetadataModule } from './metadata/metadata.module.js';
import { StorageModule } from './storage/storage.module.js';
import { ObservabilityModule } from './observability/observability.module.js';
import { AuthModule } from './auth/auth.module.js';
import { TenantModule } from './tenants/tenant.module.js';
import { ProjectModule } from './projects/project.module.js';
import { HealthModule } from './health/health.module.js';
import { IngestionModule } from './ingestion/ingestion.module.js';

@Module({
  imports: [
    ConfigModule,
    MetadataModule.forRoot(),
    StorageModule.forRoot(),
    ObservabilityModule,
    AuthModule,
    TenantModule,
    ProjectModule,
    HealthModule,
    IngestionModule,
  ],
})
export class AppModule {}
