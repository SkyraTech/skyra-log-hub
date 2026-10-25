import { Module } from '@nestjs/common';
import { IngestionController } from './ingestion.controller.js';
import { IngestionService } from './ingestion.service.js';
import { BatchValidationPipe } from './pipes/batch-validation.pipe.js';
import { AuthModule } from '../auth/auth.module.js';
import { ProjectModule } from '../projects/project.module.js';
import { RateLimitGuard } from '../common/guards/rate-limit.guard.js';

@Module({
  imports: [AuthModule, ProjectModule],
  controllers: [IngestionController],
  providers: [IngestionService, BatchValidationPipe, RateLimitGuard],
  exports: [IngestionService],
})
export class IngestionModule {}
