import { Injectable } from '@nestjs/common';
import type { BoundedLogQueryResult } from '../../query-execution/domain/bounded-query-result.model.js';
import type { AuthorizedLogQueryPlan } from '../../query-execution/domain/authorized-query-plan.model.js';
import type { SearchResponseDto } from '../api/dto/search-response.dto.js';
import { CursorCodecService } from './cursor-codec.service.js';

export interface MapResponseParams {
  readonly result: BoundedLogQueryResult;
  readonly plan: AuthorizedLogQueryPlan;
  readonly queryFingerprint: string;
  readonly sortDirection: 'asc' | 'desc';
}

@Injectable()
export class SearchResponseMapper {
  constructor(private readonly cursorCodec: CursorCodecService) {}

  public map(params: MapResponseParams): SearchResponseDto {
    const { result, plan, queryFingerprint, sortDirection } = params;

    const hasMore = Boolean(result.hasMore);
    let nextCursor: string | null = null;

    if (hasMore && result.lastPosition) {
      nextCursor = this.cursorCodec.encode({
        position: result.lastPosition,
        sortDirection,
        queryFingerprint,
        tenantId: plan.tenantId,
      });
    }

    // Determine archive watermark: latest finalized timestamp from eligible descriptors
    let archiveWatermark = new Date(0).toISOString();
    if (plan.descriptors.length > 0) {
      let maxTimeMs = 0;
      for (const d of plan.descriptors) {
        const timeMs = Date.parse(d.lastEventTimestamp || d.finalizedAt);
        if (!Number.isNaN(timeMs) && timeMs > maxTimeMs) {
          maxTimeMs = timeMs;
          archiveWatermark = d.lastEventTimestamp || d.finalizedAt;
        }
      }
    } else {
      archiveWatermark = plan.timeInterval.endExclusive;
    }

    return {
      events: result.events as unknown as Record<string, unknown>[],
      pagination: {
        has_more: hasMore,
        next_cursor: nextCursor,
        total_returned: result.events.length,
      },
      statistics: {
        scanned_bytes: result.scannedBytes,
        scanned_segments: result.scannedSegmentCount,
        execution_time_ms: result.executionDurationMs,
        archive_watermark: archiveWatermark,
      },
      scope: {
        tenant_id: plan.tenantId,
        searched_projects: plan.authorizedProjects,
      },
    };
  }
}
