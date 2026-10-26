import { Controller, Get, Post, Param, UseGuards } from '@nestjs/common';
import { QueryAuthGuard } from '../../common/guards/query-auth.guard.js';
import { NotImplementedException } from '../../common/errors/query.errors.js';

@Controller('query/v1/logs')
@UseGuards(QueryAuthGuard)
export class SearchController {
  @Post('search')
  @Get('search')
  public searchLogs(): never {
    throw new NotImplementedException(
      'Analytical search execution is scheduled for implementation in task LOGHUB-QUERY-003.',
    );
  }

  @Post('aggregate')
  @Get('aggregate')
  public aggregateLogs(): never {
    throw new NotImplementedException(
      'Analytical log aggregation is scheduled for implementation in task LOGHUB-QUERY-003.',
    );
  }

  @Post('facets')
  @Get('facets')
  public getFacets(): never {
    throw new NotImplementedException(
      'Faceted log attribute discovery is scheduled for implementation in task LOGHUB-QUERY-003.',
    );
  }

  @Get(':eventId')
  public getLogById(@Param('eventId') _eventId: string): never {
    throw new NotImplementedException(
      'Single event point-lookup by eventId is scheduled for implementation in task LOGHUB-QUERY-003.',
    );
  }
}

