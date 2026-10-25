/**
 * @skyra/log-shipper - Types and Interfaces
 */

import type { SkyraLogEvent } from '@skyra/logger-core/types';

export interface ShipperConfig {
  /** Root directory (or directories) where SDK spools are written */
  spoolRoots: string[];
  /** Directory where crash-recoverable checkpoints are stored */
  checkpointDir: string;
  /** Full URL of the ingestion gateway (e.g. http://127.0.0.1:3000/ingest/v1/logs) */
  gatewayUrl: string;
  /** Bearer machine token authorized for target tenant/projects */
  authToken: string;
  /** Maximum number of log events per submitted batch (default 100, max 500) */
  maxBatchEvents?: number;
  /** Maximum payload bytes per batch (default 2 MiB, max 5 MiB) */
  maxBatchBytes?: number;
  /** Request timeout in milliseconds (default 10000) */
  requestTimeoutMs?: number;
  /** Poll interval in milliseconds when running in continuous daemon mode */
  scanIntervalMs?: number;
  /** Directory for quarantined corrupt or unparseable lines */
  quarantineDir?: string;
  /** Retry backoff options */
  retry?: {
    initialDelayMs?: number;
    maxDelayMs?: number;
    backoffMultiplier?: number;
    maxAttempts?: number;
  };
  /** Retention policy: default preserves all source files */
  retention?: {
    deleteAcknowledgedFiles?: boolean;
    minFileAgeMsBeforeDeletion?: number;
  };
}

export interface SpoolFile {
  /** Absolute path on disk */
  fullPath: string;
  /** Stable file identifier relative to spool root */
  relativeLocator: string;
  projectId: string;
  environment: string;
  serviceName: string;
  instanceId: string;
  dateStr: string;
  partIndex: number;
  /** Whether directory has an active instance owner */
  isActive: boolean;
  sizeBytes: number;
  mtimeMs: number;
}

export interface PendingBatch {
  batchId: string;
  startOffset: number;
  endOffset: number;
  contentDigestSha256: string;
  eventCount: number;
  createdAt: string;
  events: SkyraLogEvent[];
}

export interface GatewayReceipt {
  receipt_id: string;
  journal_segment: string;
  journal_offset: number;
  committed_at: string;
  content_digest: string;
}

export interface GatewayBatchResponse {
  status: 'durably_accepted';
  batch_id: string;
  accepted_count: number;
  duplicate: boolean;
  receipt: GatewayReceipt;
}

export interface CheckpointRecord {
  relativeLocator: string;
  fullPath: string;
  lastAckOffset: number;
  lastAckTimestamp: string | null;
  pendingBatch: PendingBatch | null;
  lastReceipt: GatewayReceipt | null;
  deliveryAttempts: number;
  lastError: string | null;
  lastErrorStatus: number | null;
  updatedAt: string;
}

export interface DeliveryResult {
  success: boolean;
  duplicate?: boolean;
  receipt?: GatewayReceipt;
  statusCode?: number;
  retryable: boolean;
  error?: string;
}

export interface ShipperMetrics {
  filesDiscovered: number;
  filesProcessed: number;
  linesRead: number;
  batchesSent: number;
  eventsDelivered: number;
  duplicateAcknowledgements: number;
  retriesAttempted: number;
  corruptLinesQuarantined: number;
  permanentErrors: number;
}
