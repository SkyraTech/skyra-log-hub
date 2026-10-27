import type { TrustedArchiveSegmentDescriptor } from '../../archive-discovery/domain/archive-segment-descriptor.model.js';
import type {
  DerivedParquetMetadata,
  TrustedParquetSegmentDescriptor,
} from './parquet-segment.model.js';

export const PARQUET_CATALOG_PORT = Symbol('PARQUET_CATALOG_PORT');

export interface IParquetCatalogPort {
  /**
   * Retrieves a verified Parquet descriptor corresponding to a canonical segment if it exists and is valid.
   */
  getParquetDescriptor(
    canonicalDescriptor: TrustedArchiveSegmentDescriptor,
  ): Promise<TrustedParquetSegmentDescriptor | null>;

  /**
   * Records newly materialized Parquet metadata.
   */
  recordMaterialization(metadata: DerivedParquetMetadata): Promise<void>;

  /**
   * Invalidates a Parquet segment (e.g. on source checksum drift, corruption, or retention expiration).
   */
  invalidateSegment(
    tenantId: string,
    projectId: string,
    environment: string,
    date: string,
    segmentFilename: string,
    reason: string,
  ): Promise<void>;

  /**
   * Removes all derived Parquet files and metadata for an expired canonical segment.
   */
  purgeSegment(
    tenantId: string,
    projectId: string,
    environment: string,
    date: string,
    segmentFilename: string,
  ): Promise<void>;
}
