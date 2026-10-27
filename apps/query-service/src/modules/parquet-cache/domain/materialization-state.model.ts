import type { TrustedArchiveSegmentDescriptor } from '../../archive-discovery/domain/archive-segment-descriptor.model.js';
import type { TrustedParquetSegmentDescriptor } from './parquet-segment.model.js';

export type MaterializationState =
  | 'PENDING'
  | 'BUILDING'
  | 'VERIFYING'
  | 'READY'
  | 'INVALID'
  | 'FAILED';

export interface MaterializationJob {
  readonly jobId: string;
  readonly canonicalDescriptor: TrustedArchiveSegmentDescriptor;
  readonly stagingParquetPath: string;
  readonly stagingMetadataPath: string;
  readonly finalParquetPath: string;
  readonly finalMetadataPath: string;
  readonly attempt: number;
  readonly startedAt: string;
}

export interface MaterializationResult {
  readonly success: boolean;
  readonly jobId: string;
  readonly canonicalSegmentId: string;
  readonly parquetDescriptor?: TrustedParquetSegmentDescriptor;
  readonly error?: string;
  readonly durationMs: number;
  readonly inputBytes: number;
  readonly outputBytes: number;
  readonly recordCount: number;
}
