/**
 * @skyra/log-shipper - Standalone JSONL Shipping Agent Orchestrator
 */

import * as fs from 'node:fs';
import type { ShipperConfig, SpoolFile, DeliveryResult } from './types.js';
import { SpoolDiscovery } from './discovery.js';
import { CheckpointManager } from './checkpoint.js';
import { BatchBuilder } from './batch-builder.js';
import { ShipperHttpClient } from './http-client.js';
import { ShipperDiagnostics } from './diagnostics.js';

export class LogShipper {
  private readonly discovery: SpoolDiscovery;
  private readonly checkpoint: CheckpointManager;
  private readonly batchBuilder: BatchBuilder;
  private readonly httpClient: ShipperHttpClient;
  public readonly diagnostics: ShipperDiagnostics;

  private isRunning = false;
  private timerId: NodeJS.Timeout | null = null;

  constructor(private readonly config: ShipperConfig) {
    this.discovery = new SpoolDiscovery(config.spoolRoots);
    this.checkpoint = new CheckpointManager(config.checkpointDir);
    this.batchBuilder = new BatchBuilder({
      maxBatchEvents: config.maxBatchEvents,
      maxBatchBytes: config.maxBatchBytes,
      quarantineDir: config.quarantineDir,
    });
    this.httpClient = new ShipperHttpClient({
      gatewayUrl: config.gatewayUrl,
      authToken: config.authToken,
      requestTimeoutMs: config.requestTimeoutMs,
    });
    this.diagnostics = new ShipperDiagnostics();
  }

  /**
   * Executes a single pass across all discovered spools, shipping available batches.
   * Returns total number of batches successfully acknowledged in this cycle.
   */
  public async shipOnce(): Promise<number> {
    const files = this.discovery.discoverSpoolFiles();
    this.diagnostics.increment('filesDiscovered', files.length);

    let acknowledgedBatches = 0;

    for (const file of files) {
      const record = this.checkpoint.getRecord(file.relativeLocator, file.fullPath);

      // Check for file truncation
      if (file.sizeBytes < record.lastAckOffset) {
        this.diagnostics.logWarn('Spool file truncation detected', {
          path: file.fullPath,
          sizeBytes: file.sizeBytes,
          lastAckOffset: record.lastAckOffset,
        });
      }

      // Check if a previous crash left an unacknowledged pending batch
      if (record.pendingBatch) {
        const result = await this.httpClient.submitBatch(record.pendingBatch);
        if (result.success && result.receipt) {
          const eventCount = record.pendingBatch.eventCount;
          this.checkpoint.acknowledgeBatch(file.relativeLocator, result.receipt);
          this.diagnostics.increment('batchesSent');
          this.diagnostics.increment('eventsDelivered', eventCount);
          if (result.duplicate) {
            this.diagnostics.increment('duplicateAcknowledgements');
          }
          acknowledgedBatches++;
        } else {
          this.handleDeliveryFailure(file, result);
          continue; // Move to next file on failure
        }
      }

      // Process new data up to current end of file
      while (true) {
        const currentRecord = this.checkpoint.getRecord(file.relativeLocator, file.fullPath);
        const batch = this.batchBuilder.constructBatch(file, currentRecord.lastAckOffset);

        if (!batch) {
          break; // No more batches available in this file right now
        }

        // Persist pending batch before sending to guarantee retry stability across crashes
        this.checkpoint.setPendingBatch(file.relativeLocator, batch);

        const result = await this.httpClient.submitBatch(batch);
        if (result.success && result.receipt) {
          this.checkpoint.acknowledgeBatch(file.relativeLocator, result.receipt);
          this.diagnostics.increment('batchesSent');
          this.diagnostics.increment('eventsDelivered', batch.eventCount);
          if (result.duplicate) {
            this.diagnostics.increment('duplicateAcknowledgements');
          }
          acknowledgedBatches++;
        } else {
          this.handleDeliveryFailure(file, result);
          break; // Stop processing this file on failure
        }
      }

      // Optional retention cleanup (disabled by default)
      this.handleRetentionCleanup(file);
      this.diagnostics.increment('filesProcessed');
    }

    return acknowledgedBatches;
  }

  private handleDeliveryFailure(file: SpoolFile, result: DeliveryResult): void {
    if (result.retryable) {
      this.diagnostics.increment('retriesAttempted');
      this.diagnostics.logWarn('Retryable delivery failure', {
        path: file.fullPath,
        error: result.error,
        status: result.statusCode,
      });
      this.checkpoint.recordFailure(file.relativeLocator, result.error ?? 'Unknown error', result.statusCode);
    } else {
      this.diagnostics.increment('permanentErrors');
      this.diagnostics.logError(`Permanent delivery rejection for file ${file.fullPath}`, result.error);
      this.checkpoint.recordFailure(file.relativeLocator, result.error ?? 'Permanent rejection', result.statusCode);
    }
  }

  private handleRetentionCleanup(file: SpoolFile): void {
    if (!this.config.retention?.deleteAcknowledgedFiles) {
      return; // Safe default: preserve all source files
    }

    // Never delete active segments!
    if (file.isActive) {
      return;
    }

    const record = this.checkpoint.getRecord(file.relativeLocator, file.fullPath);
    if (record.pendingBatch !== null) {
      return; // Cannot delete with in-flight unacknowledged batch
    }

    if (record.lastAckOffset >= file.sizeBytes && file.sizeBytes > 0) {
      const minAge = this.config.retention.minFileAgeMsBeforeDeletion ?? 3600000; // 1 hour
      if (Date.now() - file.mtimeMs >= minAge) {
        try {
          fs.unlinkSync(file.fullPath);
          this.diagnostics.logInfo(`Safely deleted fully acknowledged finalized spool file: ${file.fullPath}`);
        } catch {
          // ignore cleanup errors
        }
      }
    }
  }

  /**
   * Starts background continuous polling daemon.
   */
  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    const interval = this.config.scanIntervalMs ?? 5000;

    const loop = async () => {
      if (!this.isRunning) return;
      try {
        await this.shipOnce();
      } catch (err) {
        this.diagnostics.logError('Unexpected error in ship loop', err);
      }
      if (this.isRunning) {
        this.timerId = setTimeout(loop, interval);
      }
    };

    void loop();
  }

  /**
   * Gracefully shuts down the background shipping loop.
   */
  public stop(): void {
    this.isRunning = false;
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }
}
