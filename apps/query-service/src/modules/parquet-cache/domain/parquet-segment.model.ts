export type ParquetIntegrityStatus = 'VERIFIED' | 'MISSING' | 'CORRUPT';

export interface DerivedParquetMetadata {
  readonly manifestVersion: string;
  readonly materializationVersion: string;
  readonly generationId: string;
  readonly sourceSegmentId: string;
  readonly sourceTenantId: string;
  readonly sourceProjectId: string;
  readonly sourceEnvironment: string;
  readonly sourcePartitionDate: string;
  readonly sourceChecksum: string;
  readonly sourceByteSize: number;
  readonly sourceRecordCount: number;
  readonly parquetFilename: string;
  readonly parquetSha256Checksum: string;
  readonly parquetByteSize: number;
  readonly parquetRecordCount: number;
  readonly state: 'READY' | 'INVALID' | 'FAILED' | 'BUILDING';
  readonly locatorScheme: string;
  readonly createdAt: string;
  readonly completedAt: string;
}

export interface TrustedParquetSegmentDescriptor {
  readonly id: string;
  readonly canonicalSegmentId: string;
  readonly tenantId: string;
  readonly projectId: string;
  readonly environment: string;
  readonly date: string;
  readonly segmentFilename: string; // Original canonical filename (e.g. "segment-0000.jsonl")
  readonly parquetFilename: string; // Parquet filename (e.g. "segment-0000.parquet")
  readonly resolvedPath: string;   // Absolute verified filesystem path to .parquet
  readonly byteSize: number;
  readonly recordCount: number;
  readonly sha256Checksum: string;
  readonly sourceChecksum: string;
  readonly materializationVersion: string;
  readonly integrityStatus: ParquetIntegrityStatus;
  readonly verifiedAt: string;
}
