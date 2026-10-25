import { Controller, Post, Body, UseGuards, UsePipes, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { RateLimitGuard } from '../common/guards/rate-limit.guard.js';
import { CurrentIdentity } from '../auth/current-identity.decorator.js';
import type { AuthenticatedIdentity } from '../auth/auth.types.js';
import { BatchValidationPipe } from './pipes/batch-validation.pipe.js';
import type { NormalizedBatch } from './dto/batch-request.dto.js';
import type { IngestionBatchResponseDto } from './dto/batch-response.dto.js';
import { IngestionService } from './ingestion.service.js';

@Controller('ingest/v1')
export class IngestionController {
  constructor(private readonly ingestionService: IngestionService) {}

  @Post('logs')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard, RateLimitGuard)
  public async ingestLogs(
    @Body(BatchValidationPipe) batch: NormalizedBatch,
    @CurrentIdentity() identity: AuthenticatedIdentity,
  ): Promise<IngestionBatchResponseDto> {
    return this.ingestionService.admitAndIngestBatch(batch, identity);
  }
}
