import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { QueryConfigService } from '../../../config/query-config.service.js';
import { QueryAuditService } from '../../audit/query-audit.service.js';
import { MaterializeSegmentUseCase } from './materialize-segment.use-case.js';
import { RecoverMaterializationUseCase } from './recover-materialization.use-case.js';
import { CompactionLockCoordinatorService } from './compaction-lock-coordinator.service.js';
import { CompactionDiscoveryService } from './compaction-discovery.service.js';
import { ParquetPathSafetyService } from '../infrastructure/filesystem/parquet-path-safety.service.js';
import type {
  CompactionProgress,
  CompactionJobResult,
  CompactionCycleOptions,
  PersistentFailureRecord,
  PersistentFailureState,
} from '../domain/compaction.types.js';

export interface FailureTracker {
  failureCount: number;
  firstFailureTime: number;
  lastFailureTime: number;
  lastError: string;
  terminal: boolean;
}

@Injectable()
export class BackgroundCompactionService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(BackgroundCompactionService.name);
  private timer?: ReturnType<typeof setInterval>;
  private isProcessing = false;
  private stopped = false;
  private inFlightWork?: Promise<CompactionProgress | null>;
  private readonly failureStatePath: string;

  // Bounded retry tracking: maps segmentKey to failure count & timestamp
  private readonly failureTrackers = new Map<string, FailureTracker>();

  constructor(
    private readonly config: QueryConfigService,
    private readonly audit: QueryAuditService,
    private readonly materializeUseCase: MaterializeSegmentUseCase,
    private readonly recoverUseCase: RecoverMaterializationUseCase,
    private readonly lockCoordinator: CompactionLockCoordinatorService,
    private readonly discoveryService: CompactionDiscoveryService,
    private readonly pathSafety: ParquetPathSafetyService,
  ) {
    this.failureStatePath = path.join(
      this.pathSafety.getCacheRoot(),
      '.state',
      'compaction-failures.json',
    );
    this.loadPersistentFailures();
  }

  public async onApplicationBootstrap(): Promise<void> {
    if (!this.config.compactionEnabled) {
      this.logger.log('Background storage compaction is disabled by configuration (COMPACTION_ENABLED=false).');
      return;
    }

    this.logger.log(
      `Starting BackgroundCompactionService (interval: ${this.config.compactionIntervalMs}ms, batchSize: ${this.config.compactionBatchSize}, maxWorkers: ${this.config.compactionMaxWorkers})`,
    );

    // Initial startup recovery: clean orphaned temporary staging files & expired claims
    try {
      this.recoverUseCase.execute();
      this.lockCoordinator.recoverStaleClaims();
    } catch (err: unknown) {
      this.logger.warn(`Startup compaction recovery warning: ${String(err)}`);
    }

    // Schedule background loop
    this.timer = setInterval(() => {
      void this.tick();
    }, this.config.compactionIntervalMs);
    this.timer.unref();

    // Trigger initial tick asynchronously
    setImmediate(() => {
      void this.tick();
    });
  }

  public async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    if (this.inFlightWork) {
      try {
        await this.inFlightWork;
      } catch {
        // Ignore during shutdown
      }
    }
    this.logger.log('BackgroundCompactionService stopped gracefully.');
  }

  /**
   * Executes a scheduled tick of the background compaction cycle.
   */
  private async tick(): Promise<void> {
    if (this.stopped || this.isProcessing) return;

    this.isProcessing = true;
    try {
      this.inFlightWork = this.compactOnce();
      await this.inFlightWork;
    } catch (err: unknown) {
      this.logger.error(`Unhandled error during background compaction cycle: ${String(err)}`);
    } finally {
      this.inFlightWork = undefined;
      this.isProcessing = false;
    }
  }

  /**
   * Executes a single compaction cycle across discovered eligible segments.
   * Publicly accessible for automated tests, maintenance scripts, and scheduled triggers.
   */
  public async compactOnce(options?: CompactionCycleOptions): Promise<CompactionProgress> {
    const startTimeNs = process.hrtime.bigint();
    const cycleId = `cycle-${Date.now()}`;
    const correlationId = options?.correlationId ?? `compaction-${cycleId}`;
    const batchSize = options?.batchSize ?? this.config.compactionBatchSize;
    const maxWorkers = Math.max(1, options?.maxWorkers ?? this.config.compactionMaxWorkers);

    this.audit.recordSecurityEvent({
      eventType: 'COMPACTION_CYCLE_STARTED',
      correlationId,
      detail: `Started compaction cycle ${cycleId} (batchSize: ${batchSize}, maxWorkers: ${maxWorkers})`,
    });

    // 1. Cycle recovery: clean expired claims before processing
    const staleClaimsRecovered = this.lockCoordinator.recoverStaleClaims();
    if (staleClaimsRecovered > 0) {
      this.logger.log(`Recovered ${staleClaimsRecovered} expired compaction claims before cycle`);
    }

    // 2. Discover eligible segments
    const eligibleSegments = await this.discoveryService.discoverEligibleSegments(batchSize, correlationId);

    const totalDiscovered = eligibleSegments.length;
    let totalClaimed = 0;
    let totalConverted = 0;
    let totalReused = 0;
    let totalFailed = 0;
    let totalSkipped = 0;
    let inputBytesProcessed = 0;
    let outputBytesGenerated = 0;
    let totalRecordsCompacted = 0;
    const jobResults: CompactionJobResult[] = [];

    // 3. Filter out segments in backoff or exhausted retries
    const now = Date.now();
    const actionableSegments = eligibleSegments.filter((item) => {
      const segmentKey = this.lockCoordinator.buildSegmentKey(item.descriptor);
      const tracker = this.failureTrackers.get(segmentKey);
      if (!tracker) return true;

      // Exhausted retries (terminal failure)
      if (tracker.terminal || tracker.failureCount >= this.config.compactionMaxRetries) {
        totalSkipped++;
        return false;
      }

      // Exponential backoff check: backoffMs * 2^(failures - 1)
      const backoffDelay = this.config.compactionRetryBackoffMs * Math.pow(2, tracker.failureCount - 1);
      if (now - tracker.lastFailureTime < backoffDelay) {
        totalSkipped++;
        return false;
      }

      return true;
    });

    // 4. Bounded concurrent worker execution
    const chunks: (typeof actionableSegments)[] = [];
    for (let i = 0; i < actionableSegments.length; i += maxWorkers) {
      chunks.push(actionableSegments.slice(i, i + maxWorkers));
    }

    for (const chunk of chunks) {
      if (this.stopped) break;

      const promises = chunk.map(async (item) => {
        const descriptor = item.descriptor;
        const segmentKey = this.lockCoordinator.buildSegmentKey(descriptor);

        // A. Claim the segment via distributed coordinator
        const handle = await this.lockCoordinator.claimSegment(descriptor, correlationId);
        if (!handle) {
          totalSkipped++;
          return null; // Claimed by another worker, active lock, or coordination failure (fail closed)
        }

        totalClaimed++;

        // B. Set up active heartbeat renewal
        let leaseRevoked = false;
        const heartbeatInterval = Math.max(200, Math.floor(handle.leaseTtlMs / 3));
        const heartbeatTimer = setInterval(async () => {
          if (leaseRevoked || this.stopped) return;
          const renewed = await this.lockCoordinator.renewLease(handle);
          if (!renewed) {
            leaseRevoked = true;
            this.logger.warn(`Heartbeat renewal failed for ${descriptor.segmentFilename}; worker lost lease ownership.`);
          }
        }, heartbeatInterval);
        heartbeatTimer.unref();

        try {
          // C. Materialize to Parquet reusing DuckDB converter with pre-publication fencing
          const result = await this.materializeUseCase.execute(descriptor, correlationId, {
            verifyOwnership: async () => {
              if (leaseRevoked) return false;
              return this.lockCoordinator.verifyOwnership(handle);
            },
          });

          if (result.success) {
            // Success: clear failure tracker and persist state
            this.failureTrackers.delete(segmentKey);
            this.savePersistentFailures();

            totalConverted++;
            if (result.jobId === 'reused') totalReused++;
            inputBytesProcessed += result.inputBytes;
            outputBytesGenerated += result.outputBytes;
            totalRecordsCompacted += result.recordCount;

            const jobResult: CompactionJobResult = {
              segmentId: descriptor.segmentFilename,
              tenantId: descriptor.tenantId,
              projectId: descriptor.projectId,
              success: true,
              durationMs: result.durationMs,
              inputBytes: result.inputBytes,
              outputBytes: result.outputBytes,
              recordCount: result.recordCount,
              isLegalHold: item.isLegalHold,
            };
            jobResults.push(jobResult);

            if (item.isLegalHold) {
              this.audit.recordSecurityEvent({
                eventType: 'COMPACTION_LEGAL_HOLD_PRESERVED',
                tenantId: descriptor.tenantId,
                projects: [descriptor.projectId],
                correlationId,
                detail: `Segment ${descriptor.segmentFilename} compacted under active legal hold: ${result.recordCount} rows verified, source JSONL preserved`,
              });
            }

            this.audit.recordSecurityEvent({
              eventType: 'COMPACTION_SEGMENT_COMPLETED',
              tenantId: descriptor.tenantId,
              projects: [descriptor.projectId],
              correlationId,
              durationMs: result.durationMs,
              detail: `Compacted ${descriptor.segmentFilename} (${result.recordCount} records, ${result.outputBytes} bytes in ${result.durationMs}ms)`,
            });

            return jobResult;
          } else {
            // Failure: update failure tracker with bounded retry limit
            totalFailed++;
            const currentTracker = this.failureTrackers.get(segmentKey) ?? {
              failureCount: 0,
              firstFailureTime: Date.now(),
              lastFailureTime: 0,
              lastError: '',
              terminal: false,
            };
            currentTracker.failureCount++;
            currentTracker.lastFailureTime = Date.now();
            currentTracker.lastError = result.error ?? 'Unknown conversion error';
            currentTracker.terminal = currentTracker.failureCount >= this.config.compactionMaxRetries;

            this.failureTrackers.set(segmentKey, currentTracker);
            this.savePersistentFailures();

            const jobResult: CompactionJobResult = {
              segmentId: descriptor.segmentFilename,
              tenantId: descriptor.tenantId,
              projectId: descriptor.projectId,
              success: false,
              durationMs: result.durationMs,
              inputBytes: result.inputBytes,
              outputBytes: 0,
              recordCount: 0,
              error: result.error,
              isLegalHold: item.isLegalHold,
            };
            jobResults.push(jobResult);

            this.audit.recordSecurityEvent({
              eventType: currentTracker.terminal
                ? 'COMPACTION_SEGMENT_FAILED'
                : 'COMPACTION_SEGMENT_RETRY',
              tenantId: descriptor.tenantId,
              projects: [descriptor.projectId],
              correlationId,
              detail: `Compaction attempt ${currentTracker.failureCount} failed for ${descriptor.segmentFilename}: ${result.error}`,
            });

            return jobResult;
          }
        } finally {
          clearInterval(heartbeatTimer);
          // Release distributed claim verifying generation
          await this.lockCoordinator.releaseClaim(handle);
        }
      });

      await Promise.all(promises);
    }

    const durationMs = Math.round(Number(process.hrtime.bigint() - startTimeNs) / 1_000_000);

    const progress: CompactionProgress = {
      cycleId,
      startTime: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationMs,
      totalDiscovered,
      totalClaimed,
      totalConverted,
      totalReused,
      totalFailed,
      totalSkipped,
      inputBytesProcessed,
      outputBytesGenerated,
      totalRecordsCompacted,
      jobResults,
    };

    this.audit.recordSecurityEvent({
      eventType: 'COMPACTION_CYCLE_COMPLETED',
      correlationId,
      durationMs,
      detail: `Compaction cycle ${cycleId} finished in ${durationMs}ms: ${totalConverted} converted, ${totalFailed} failed, ${totalSkipped} skipped`,
      metadata: {
        cycleId,
        durationMs,
        totalDiscovered,
        totalClaimed,
        totalConverted,
        totalFailed,
        totalSkipped,
      },
    });

    return progress;
  }

  /**
   * Returns current failure trackers for diagnostics.
   */
  public getFailureTrackers(): ReadonlyMap<string, FailureTracker> {
    return new Map(this.failureTrackers);
  }

  /**
   * Clears a specific segment failure tracker (explicit operator recovery path).
   */
  public clearFailure(segmentKey: string): void {
    this.failureTrackers.delete(segmentKey);
    this.savePersistentFailures();
  }

  /**
   * Resets all failure trackers (operator recovery & test fixtures).
   */
  public resetFailureTrackers(): void {
    this.failureTrackers.clear();
    try {
      if (fs.existsSync(this.failureStatePath)) {
        fs.unlinkSync(this.failureStatePath);
      }
    } catch {
      // safe cleanup
    }
  }

  /**
   * Loads persisted failure records from disk across service restarts.
   */
  private loadPersistentFailures(): void {
    try {
      if (!fs.existsSync(this.failureStatePath)) return;
      const raw = fs.readFileSync(this.failureStatePath, 'utf8');
      const state = JSON.parse(raw) as PersistentFailureState;
      if (state && state.failures) {
        for (const [key, record] of Object.entries(state.failures)) {
          this.failureTrackers.set(key, {
            failureCount: record.failureCount,
            firstFailureTime: record.firstFailureTime,
            lastFailureTime: record.lastFailureTime,
            lastError: record.lastError,
            terminal: record.terminal,
          });
        }
      }
    } catch (err: unknown) {
      this.logger.warn(`Failed reading persistent compaction failure state: ${String(err)}`);
    }
  }

  /**
   * Atomically persists bounded failure records to disk.
   */
  private savePersistentFailures(): void {
    try {
      const stateDir = path.dirname(this.failureStatePath);
      this.pathSafety.ensureDirectoryExists(stateDir);

      // Bound to most recent 1,000 entries
      const entries = Array.from(this.failureTrackers.entries()).slice(-1000);
      const failures: Record<string, PersistentFailureRecord> = {};
      for (const [key, val] of entries) {
        failures[key] = {
          segmentKey: key,
          failureCount: val.failureCount,
          firstFailureTime: val.firstFailureTime,
          lastFailureTime: val.lastFailureTime,
          lastError: val.lastError,
          terminal: val.terminal,
        };
      }

      const state: PersistentFailureState = {
        version: '1.0',
        updatedAt: new Date().toISOString(),
        failures,
      };

      const tmpPath = `${this.failureStatePath}.tmp-${Date.now()}`;
      fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2), 'utf8');
      fs.renameSync(tmpPath, this.failureStatePath);
    } catch (err: unknown) {
      this.logger.warn(`Failed persisting compaction failure state: ${String(err)}`);
    }
  }
}
