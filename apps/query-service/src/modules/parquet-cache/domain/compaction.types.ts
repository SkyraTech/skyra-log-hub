import type { TrustedArchiveSegmentDescriptor } from '../../archive-discovery/domain/archive-segment-descriptor.model.js';

export interface CompactionProgress {
  readonly cycleId: string;
  readonly startTime: string;
  readonly completedAt: string;
  readonly durationMs: number;
  readonly totalDiscovered: number;
  readonly totalClaimed: number;
  readonly totalConverted: number;
  readonly totalReused: number;
  readonly totalFailed: number;
  readonly totalSkipped: number;
  readonly inputBytesProcessed: number;
  readonly outputBytesGenerated: number;
  readonly totalRecordsCompacted: number;
  readonly jobResults: readonly CompactionJobResult[];
}

export interface CompactionJobResult {
  readonly segmentId: string;
  readonly tenantId: string;
  readonly projectId: string;
  readonly success: boolean;
  readonly durationMs: number;
  readonly inputBytes: number;
  readonly outputBytes: number;
  readonly recordCount: number;
  readonly error?: string;
  readonly isLegalHold?: boolean;
}

export interface CompactionClaim {
  readonly claimId: string;
  readonly generation: number;
  readonly workerId: string;
  readonly tenantId: string;
  readonly projectId: string;
  readonly environment: string;
  readonly serviceName: string;
  readonly date: string;
  readonly segmentFilename: string;
  readonly sha256Checksum: string;
  readonly claimedAt: string;
  readonly lastHeartbeatAt: string;
  readonly expiresAt: string;
  readonly leaseTtlMs: number;
  readonly status: 'ACTIVE' | 'CONVERTING' | 'PUBLISHING' | 'RELEASED';
  readonly topology: 'STANDALONE_FILESYSTEM' | 'DISTRIBUTED_POSTGRES_COORDINATED';
}

export interface LockHandle {
  readonly claimId: string;
  readonly generation: number;
  readonly segmentKey: string;
  readonly claimFilePath: string;
  readonly leaseTtlMs: number;
  readonly hashInt64?: bigint;
  dbClient?: any;
  released?: boolean;
}

export interface EligibleCompactionSegment {
  readonly descriptor: TrustedArchiveSegmentDescriptor;
  readonly isLegalHold: boolean;
  readonly retentionDays: number;
  readonly reason: 'UNMATERIALIZED' | 'STALE_DERIVED';
}

export interface CompactionCycleOptions {
  readonly batchSize?: number;
  readonly maxWorkers?: number;
  readonly correlationId?: string;
}

export interface PersistentFailureRecord {
  readonly segmentKey: string;
  readonly failureCount: number;
  readonly firstFailureTime: number;
  readonly lastFailureTime: number;
  readonly lastError: string;
  readonly terminal: boolean;
}

export interface PersistentFailureState {
  readonly version: '1.0';
  readonly updatedAt: string;
  readonly failures: Record<string, PersistentFailureRecord>;
}
