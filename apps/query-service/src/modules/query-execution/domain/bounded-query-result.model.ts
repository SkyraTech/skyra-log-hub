export interface CanonicalLogEventRecord {
  readonly '@timestamp': string;
  readonly 'ecs.version'?: string;
  readonly event: {
    readonly id: string;
    readonly action?: string;
    readonly dataset?: string;
    readonly category?: readonly string[];
    readonly type?: readonly string[];
    readonly outcome?: string;
    readonly duration?: number;
    readonly [key: string]: unknown;
  };
  readonly log: {
    readonly level: string;
    readonly logger?: string;
    readonly [key: string]: unknown;
  };
  readonly message: string;
  readonly service: {
    readonly name: string;
    readonly environment: string;
    readonly version?: string;
    readonly [key: string]: unknown;
  };
  readonly skyra: {
    readonly project_id: string;
    readonly schema_version: string;
    readonly component?: string;
    readonly duration_ms?: number;
    readonly [key: string]: unknown;
  };
  readonly trace?: {
    readonly id?: string;
    readonly [key: string]: unknown;
  };
  readonly span?: {
    readonly id?: string;
    readonly [key: string]: unknown;
  };
  readonly error?: {
    readonly type?: string;
    readonly message?: string;
    readonly stack_trace?: string;
    readonly [key: string]: unknown;
  };
  readonly http?: {
    readonly request?: {
      readonly method?: string;
      readonly [key: string]: unknown;
    };
    readonly response?: {
      readonly status_code?: number;
      readonly [key: string]: unknown;
    };
    readonly url?: string;
    readonly [key: string]: unknown;
  };
  readonly user?: {
    readonly id?: string;
    readonly name?: string;
    readonly email?: string;
    readonly [key: string]: unknown;
  };
  readonly labels?: Record<string, string>;
  readonly tags?: readonly string[];
  readonly [key: string]: unknown;
}

export interface BoundedLogQueryResult {
  readonly queryId: string;
  readonly events: readonly CanonicalLogEventRecord[];
  readonly matchedCount: number;
  readonly scannedSegmentCount: number;
  readonly scannedBytes: number;
  readonly executionDurationMs: number;
  readonly timeInterval: {
    readonly startInclusive: string;
    readonly endExclusive: string;
  };
  readonly truncated: boolean;
  readonly tieBreakerApplied: boolean;
  readonly hasMore?: boolean;
  readonly lastPosition?: {
    readonly timestamp: string;
    readonly eventId: string;
    readonly segmentId: string;
    readonly recordOffset: number;
  };
}

