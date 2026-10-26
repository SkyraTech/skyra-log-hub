import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  Headers,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { QueryAuthGuard } from '../../common/guards/query-auth.guard.js';
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator.js';
import type { QueryPrincipal } from '../auth/domain/principal.model.js';
import { NotImplementedException } from '../../common/errors/query.errors.js';
import { SearchValidationPipe } from './api/pipes/search-validation.pipe.js';
import { EventLookupValidationPipe } from './api/pipes/event-lookup-validation.pipe.js';
import type { SearchRequestDto } from './api/dto/search-request.dto.js';
import type { SearchResponseDto } from './api/dto/search-response.dto.js';
import type { EventLookupQueryDto } from './api/dto/event-lookup-query.dto.js';
import { SearchLogsUseCase } from './application/search-logs.use-case.js';
import { GetLogEventUseCase } from './application/get-log-event.use-case.js';

@Controller('query/v1/logs')
@UseGuards(QueryAuthGuard)
export class SearchController {
  constructor(
    private readonly searchLogsUseCase: SearchLogsUseCase,
    private readonly getLogEventUseCase: GetLogEventUseCase,
  ) {}

  @Post('search')
  @HttpCode(HttpStatus.OK)
  public async searchLogs(
    @CurrentPrincipal() principal: QueryPrincipal,
    @Body(SearchValidationPipe) request: SearchRequestDto,
    @Headers('x-correlation-id') correlationId?: string,
  ): Promise<SearchResponseDto> {
    return this.searchLogsUseCase.execute(principal, request, correlationId);
  }

  @Get('search')
  public searchLogsGet(): never {
    throw new NotImplementedException(
      'Search requires a POST request with a JSON request body conforming to search-request.schema.json.',
    );
  }

  @Post('aggregate')
  public aggregateLogsPost(): never {
    throw new NotImplementedException(
      'Analytical log aggregation is scheduled for implementation in task LOGHUB-QUERY-005.',
    );
  }

  @Get('aggregate')
  public aggregateLogsGet(): never {
    throw new NotImplementedException(
      'Analytical log aggregation is scheduled for implementation in task LOGHUB-QUERY-005.',
    );
  }

  @Post('facets')
  public getFacetsPost(): never {
    throw new NotImplementedException(
      'Faceted log attribute discovery is scheduled for implementation in task LOGHUB-QUERY-005.',
    );
  }

  @Get('facets')
  public getFacetsGet(): never {
    throw new NotImplementedException(
      'Faceted log attribute discovery is scheduled for implementation in task LOGHUB-QUERY-005.',
    );
  }

  @Get(':eventId')
  @HttpCode(HttpStatus.OK)
  public async getLogById(
    @CurrentPrincipal() principal: QueryPrincipal,
    @Param('eventId') rawEventId: string,
    @Query(EventLookupValidationPipe) query: EventLookupQueryDto,
    @Headers('x-correlation-id') correlationId?: string,
  ): Promise<Record<string, unknown>> {
    const eventId = EventLookupValidationPipe.validateEventId(rawEventId);
    return this.getLogEventUseCase.execute(principal, {
      eventId,
      projectId: query.projectId,
      date: query.date,
      correlationId,
    });
  }
}
