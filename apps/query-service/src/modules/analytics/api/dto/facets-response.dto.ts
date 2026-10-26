import type { QueryStatisticsDto, QueryScopeDto } from './aggregate-response.dto.js';

export interface FacetItemDto {
  value: string;
  count: number;
}

export interface FacetsResponseDto {
  facets: Record<string, FacetItemDto[]>;
  statistics: QueryStatisticsDto;
  scope: QueryScopeDto;
}
