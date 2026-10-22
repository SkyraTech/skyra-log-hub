import type { LogLevel, CanonicalEnvironment, LegacyEnvironment } from '@skyra/logger-core';

/**
 * Resource limits to protect host application against memory leaks or runaway log events.
 */
export interface ResourceLimits {
  /** Maximum length of the log message string (default: 8,192 characters) */
  maxMessageLength: number;
  /** Maximum serialized event size in bytes (default: 1,048,576 = 1 MiB) */
  maxEventSizeBytes: number;
  /** Maximum metadata object nesting depth (default: 32 levels) */
  maxMetadataDepth: number;
  /** Maximum object key/value entries per object (default: 1,000) */
  maxObjectEntries: number;
  /** Maximum array length (default: 500 items) */
  maxArrayLength: number;
  /** Maximum in-memory write queue memory in bytes (default: 67,108,864 = 64 MiB) */
  maxQueueMemoryBytes: number;
  /** Maximum in-memory pending events in queue (default: 10,000) */
  maxPendingEvents: number;
}

export const DEFAULT_RESOURCE_LIMITS: Readonly<ResourceLimits> = {
  maxMessageLength: 8_192,
  maxEventSizeBytes: 1_048_576,
  maxMetadataDepth: 32,
  maxObjectEntries: 1_000,
  maxArrayLength: 500,
  maxQueueMemoryBytes: 64 * 1024 * 1024,
  maxPendingEvents: 10_000,
};

/**
 * UTC daily and size-based rotation configuration for JSONL file transport.
 */
export interface FileRotationConfig {
  /** Rotation interval: 'utc-day' (midnight UTC) */
  interval?: 'utc-day';
  /**
   * Maximum file segment size in bytes before size-based rollover.
   * Default: 104,857,600 bytes (100 MiB). Configurable between 10 MiB and 250 MiB.
   */
  maxFileSizeBytes?: number;
}

export const DEFAULT_MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MiB

/**
 * Local file retention policy configuration.
 * Note: Unshipped logs are never automatically deleted by default.
 */
export interface FileRetentionConfig {
  /** Retention duration in hours (default: 48 hours per storage contract) */
  maxAgeHours?: number;
  /** Maximum total storage quota in bytes across all segments for this instance */
  maxTotalBytes?: number;
  /** Whether automatic deletion of confirmed shipped logs is enabled (default: false) */
  enableAutoDelete?: boolean;
}

/**
 * In-memory buffering parameters for file transport.
 */
export interface FileBufferConfig {
  /** Maximum buffer size in bytes before automatic flush to OS (default: 64 KiB) */
  maxBatchBytes?: number;
  /** Periodic flush interval in milliseconds (default: 250 ms) */
  flushIntervalMs?: number;
}

/**
 * File system permission overrides for POSIX environments.
 */
export interface FilePermissionsConfig {
  /** Directory mode (default: 0o750) */
  dirMode?: number;
  /** File mode (default: 0o640) */
  fileMode?: number;
}

/**
 * Configuration for JSONL file transport adhering to contracts/storage-contract.md.
 */
export interface FileTransportConfig {
  type: 'file';
  /**
   * Base directory root for log files (e.g. './logs' or '/var/log/skyra').
   * Directory hierarchy: ${directory}/${projectId}/${environment}/${serviceName}/${instanceId}/${YYYY-MM-DD}.part-${PART_INDEX}.jsonl
   */
  directory: string;
  /** Rotation parameters */
  rotation?: FileRotationConfig;
  /** Optional retention settings */
  retention?: FileRetentionConfig;
  /** In-memory write buffer settings */
  buffer?: FileBufferConfig;
  /** File permissions (POSIX) */
  permissions?: FilePermissionsConfig;
}

/**
 * Configuration for stdout JSONL transport (suitable for containers/serverless).
 */
export interface StdoutTransportConfig {
  type: 'stdout';
}

export type TransportConfig = FileTransportConfig | StdoutTransportConfig;

/**
 * Full configuration options for createSkyraLogger.
 */
export interface SkyraLoggerConfig {
  /** Canonical enterprise project code (kebab-case, e.g. 'skyra-erp') */
  projectId: string;
  /** Microservice or subsystem identifier (kebab-case, e.g. 'erp-api') */
  serviceName: string;
  /** Target deployment tier ('production' | 'staging' | 'development' | 'test' | 'local') */
  environment: CanonicalEnvironment | LegacyEnvironment;
  /** Process, container, pod, or worker instance ID (e.g. 'instance-01') */
  instanceId: string;

  /** Optional service release version (e.g. '1.0.0') */
  serviceVersion?: string;
  /** Optional node or host name override */
  nodeName?: string;

  /** Minimum log level to emit (default: 'info') */
  level?: LogLevel;

  /** Primary transport configuration (default: stdout) */
  transport?: TransportConfig;

  /**
   * Additional application-specific sensitive keys to redact.
   * Merged with default mandatory sensitive keys without weakening default policies.
   */
  additionalSensitiveKeys?: string[];

  /** Configurable resource and memory safety limits */
  limits?: Partial<ResourceLimits>;

  /**
   * Log severity levels that immediately trigger an OS fsync for crash durability.
   * Default: ['error', 'fatal']
   */
  fsyncOnLevels?: LogLevel[];

  /**
   * Injectable clock provider for deterministic timestamp generation and rotation tests.
   * Default: () => new Date()
   */
  clock?: () => Date;

  /**
   * Optional schema validation mode in runtime:
   * 'strict' validates every emitted event with Ajv 2020 schema (throws/reports on defect).
   * 'off' optimizes for maximum throughput.
   * Default: 'off' in production, recommended 'strict' in development/tests.
   */
  validationMode?: 'strict' | 'off';

  /** Optional callback invoked when the bounded queue drops events due to overflow */
  onDrop?: (droppedCount: number, reason: string) => void;
  /** Optional callback invoked when a background transport write fails */
  onError?: (error: Error) => void;
}

/**
 * Resolved and validated runtime configuration with defaults applied.
 */
export interface ResolvedSkyraLoggerConfig {
  projectId: string;
  serviceName: string;
  environment: CanonicalEnvironment;
  instanceId: string;
  serviceVersion?: string;
  nodeName?: string;
  level: LogLevel;
  transport: TransportConfig;
  additionalSensitiveKeys: string[];
  limits: ResourceLimits;
  fsyncOnLevels: Set<LogLevel>;
  clock: () => Date;
  validationMode: 'strict' | 'off';
  onDrop?: (droppedCount: number, reason: string) => void;
  onError?: (error: Error) => void;
}
