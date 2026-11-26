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
import type {
  CompactionProgress,
  CompactionJobResult,
  CompactionCycleOptions,
} from '../domain/compaction.types.js';

export interface FailureTracker {
  failureCount: number;
  lastFailureTime: number;
  lastError: string;
}

@Injectable()
export class BackgroundCompactionService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(BackgroundCompactionService.name);
  private timer?: ReturnType<typeof setInterval>;
  private isProcessing = false;
  private stopped = false;
  private inFlightWork?: Promise<CompactionProgress | null>;

  // Bounded retry tracking: maps segmentKey to failure count & timestamp
  private readonly failureTrackers = new Map<string, FailureTracker>();

  constructor(
    private readonly config: QueryConfigService,
    private readonly audit: QueryAuditService,
    private readonly materializeUseCase: MaterializeSegmentUseCase,
    private readonly recoverUseCase: RecoverMaterializationUseCase,
    private readonly lockCoordinator: CompactionLockCoordinatorService,
    private readonly discoveryService: CompactionDiscoveryService,
  ) {}

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

    // 3. Filter out segments in backoff
    const now = Date.now();
    const actionableSegments = eligibleSegments.filter((item) => {
      const segmentKey = this.lockCoordinator.buildSegmentKey(item.descriptor);
      const tracker = this.failureTrackers.get(segmentKey);
      if (!tracker) return true;

      // Exhausted retries
      if (tracker.failureCount >= this.config.compactionMaxRetries) {
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
          return null; // Claimed by another worker or actively locked
        }

        totalClaimed++;

        try {
          // B. Materialize to Parquet reusing DuckDB converter
          const result = await this.materializeUseCase.execute(descriptor, correlationId);

          if (result.success) {
            // Success: clear failure tracker
            this.failureTrackers.delete(segmentKey);
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
            // Failure: track retry backoff
            totalFailed++;
            const currentTracker = this.failureTrackers.get(segmentKey) ?? {
              failureCount: 0,
              lastFailureTime: 0,
              lastError: '',
            };
            currentTracker.failureCount++;
            currentTracker.lastFailureTime = Date.now();
            currentTracker.lastError = result.error ?? 'Unknown conversion error';
            this.failureTrackers.set(segmentKey, currentTracker);

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
              eventType:
                currentTracker.failureCount >= this.config.compactionMaxRetries
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
          // Release distributed claim
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
   * Resets failure trackers (for test fixtures).
   */
  public resetFailureTrackers(): void {
    this.failureTrackers.clear();
  }
}
