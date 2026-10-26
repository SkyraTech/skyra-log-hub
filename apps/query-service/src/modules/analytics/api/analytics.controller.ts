import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  UseGuards,
  HttpCode,
  HttpStatus,
  MethodNotAllowedException,
} from '@nestjs/common';
import { QueryAuthGuard } from '../../../common/guards/query-auth.guard.js';
import { CurrentPrincipal } from '../../../common/decorators/current-principal.decorator.js';
import type { QueryPrincipal } from '../../auth/domain/principal.model.js';
import { AggregateValidationPipe } from './pipes/aggregate-validation.pipe.js';
import { FacetsValidationPipe } from './pipes/facets-validation.pipe.js';
import type { AggregateRequestDto } from './dto/aggregate-request.dto.js';
import type { AggregateResponseDto } from './dto/aggregate-response.dto.js';
import type { FacetsRequestDto } from './dto/facets-request.dto.js';
import type { FacetsResponseDto } from './dto/facets-response.dto.js';
import { AggregateLogsUseCase } from '../application/aggregate-logs.use-case.js';
import { DiscoverFacetsUseCase } from '../application/discover-facets.use-case.js';

@Controller('query/v1/logs')
@UseGuards(QueryAuthGuard)
export class AnalyticsController {
  constructor(
    private readonly aggregateLogsUseCase: AggregateLogsUseCase,
    private readonly discoverFacetsUseCase: DiscoverFacetsUseCase,
  ) {}

  @Post('aggregate')
  @HttpCode(HttpStatus.OK)
  public async aggregateLogs(
    @CurrentPrincipal() principal: QueryPrincipal,
    @Body(AggregateValidationPipe) dto: AggregateRequestDto,
    @Headers('x-correlation-id') correlationId?: string,
  ): Promise<AggregateResponseDto> {
    return await this.aggregateLogsUseCase.execute(principal, dto, correlationId);
  }

  @Post('facets')
  @HttpCode(HttpStatus.OK)
  public async getFacets(
    @CurrentPrincipal() principal: QueryPrincipal,
    @Body(FacetsValidationPipe) dto: FacetsRequestDto,
    @Headers('x-correlation-id') correlationId?: string,
  ): Promise<FacetsResponseDto> {
    return await this.discoverFacetsUseCase.execute(principal, dto, correlationId);
  }

  @Get('aggregate')
  public aggregateGetNotAllowed(): never {
    throw new MethodNotAllowedException('GET method is not allowed for /query/v1/logs/aggregate. Use POST.');
  }

  @Get('facets')
  public facetsGetNotAllowed(): never {
    throw new MethodNotAllowedException('GET method is not allowed for /query/v1/logs/facets. Use POST.');
  }
}
