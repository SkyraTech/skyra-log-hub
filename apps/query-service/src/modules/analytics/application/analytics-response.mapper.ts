import { Injectable } from '@nestjs/common';
import type {
  AggregationQueryResult,
  SingleAggregationResult,
} from '../domain/aggregation.model.js';
import type { FacetsQueryResult } from '../domain/facet.model.js';
import type {
  AggregateResponseDto,
  AggregationBucketResultDto,
} from '../api/dto/aggregate-response.dto.js';
import type { FacetsResponseDto } from '../api/dto/facets-response.dto.js';

@Injectable()
export class AnalyticsResponseMapper {
  public mapAggregationResult(result: AggregationQueryResult): AggregateResponseDto {
    const aggregations: Record<string, AggregationBucketResultDto> = {};

    for (const [name, aggResult] of Object.entries(result.aggregations)) {
      aggregations[name] = this.mapSingleAggregation(aggResult);
    }

    return {
      aggregations,
      statistics: {
        scanned_bytes: result.scannedBytes,
        scanned_segments: result.scannedSegments,
        execution_time_ms: result.executionTimeMs,
        archive_watermark: result.archiveWatermark,
      },
      scope: {
        tenant_id: result.tenantId,
        searched_projects: [...result.searchedProjects],
      },
    };
  }

  public mapFacetsResult(result: FacetsQueryResult): FacetsResponseDto {
    const facets: Record<string, { value: string; count: number }[]> = {};

    for (const [fieldName, items] of Object.entries(result.facets)) {
      facets[fieldName] = items.map((i) => ({
        value: i.value,
        count: i.count,
      }));
    }

    return {
      facets,
      statistics: {
        scanned_bytes: result.scannedBytes,
        scanned_segments: result.scannedSegments,
        execution_time_ms: result.executionTimeMs,
        archive_watermark: result.archiveWatermark,
      },
      scope: {
        tenant_id: result.tenantId,
        searched_projects: [...result.searchedProjects],
      },
    };
  }

  private mapSingleAggregation(result: SingleAggregationResult): AggregationBucketResultDto {
    switch (result.type) {
      case 'date_histogram':
        return {
          type: 'date_histogram',
          buckets: result.buckets.map((b) => ({
            timestamp: b.timestamp,
            count: b.count,
          })),
        };

      case 'terms':
        return {
          type: 'terms',
          buckets: result.buckets.map((b) => ({
            key: b.key,
            count: b.count,
          })),
        };

      case 'cardinality':
        return {
          type: 'cardinality',
          value: result.value,
        };

      default: {
        const _exhaustiveCheck: never = result;
        throw new Error(`Unhandled aggregation result type: ${JSON.stringify(_exhaustiveCheck)}`);
      }
    }
  }
}
