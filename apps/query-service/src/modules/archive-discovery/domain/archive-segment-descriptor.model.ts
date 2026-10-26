export interface TrustedArchiveSegmentDescriptor {
  readonly id: string;
  readonly tenantId: string;
  readonly projectId: string;
  readonly environment: string;
  readonly serviceName: string;
  readonly date: string;                     // YYYY-MM-DD
  readonly segmentFilename: string;          // e.g. "segment-0000.jsonl"
  readonly resolvedPath: string;             // Canonical verified absolute filesystem path
  readonly recordCount: number;
  readonly byteSize: number;
  readonly sha256Checksum: string;
  readonly firstEventTimestamp: string;
  readonly lastEventTimestamp: string;
  readonly finalizedAt: string;
  readonly verifiedAt: string;               // ISO 8601 UTC timestamp of filesystem/checksum verification
  readonly integrityStatus: 'VERIFIED' | 'MISSING' | 'CORRUPT';
}
