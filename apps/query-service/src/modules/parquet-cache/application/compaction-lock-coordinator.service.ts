import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { ParquetPathSafetyService } from '../infrastructure/filesystem/parquet-path-safety.service.js';
import { QueryConfigService } from '../../../config/query-config.service.js';
import { QueryAuditService } from '../../audit/query-audit.service.js';
import { PrismaService } from '../../../metadata/prisma.service.js';
import type { TrustedArchiveSegmentDescriptor } from '../../archive-discovery/domain/archive-segment-descriptor.model.js';
import type { CompactionClaim } from '../domain/compaction.types.js';

export interface LockHandle {
  readonly claimId: string;
  readonly segmentKey: string;
  readonly claimFilePath: string;
  readonly hashInt64?: bigint;
}

@Injectable()
export class CompactionLockCoordinatorService {
  private readonly logger = new Logger(CompactionLockCoordinatorService.name);
  private readonly workerId: string;

  constructor(
    private readonly pathSafety: ParquetPathSafetyService,
    private readonly config: QueryConfigService,
    private readonly audit: QueryAuditService,
    @Optional() private readonly prisma?: PrismaService,
  ) {
    this.workerId = `compactor-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  }

  public getWorkerId(): string {
    return this.workerId;
  }

  public buildSegmentKey(descriptor: TrustedArchiveSegmentDescriptor): string {
    return `${descriptor.tenantId}:${descriptor.projectId}:${descriptor.environment}:${descriptor.serviceName}:${descriptor.date}:${descriptor.segmentFilename}`;
  }

  public buildKeyHash(segmentKey: string): string {
    return crypto.createHash('sha256').update(segmentKey).digest('hex');
  }

  /**
   * Attempts to claim a segment for compaction.
   * Returns a LockHandle if claimed successfully, or null if already claimed by another worker.
   */
  public async claimSegment(
    descriptor: TrustedArchiveSegmentDescriptor,
    correlationId?: string,
  ): Promise<LockHandle | null> {
    const segmentKey = this.buildSegmentKey(descriptor);
    const keyHash = this.buildKeyHash(segmentKey);
    const claimsDir = this.pathSafety.getClaimsDirectory();
    const claimFilePath = path.join(claimsDir, `${keyHash}.claim.json`);
    const ttlMs = this.config.compactionLockTtlMs;

    const claimId = crypto.randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs);

    const claimData: CompactionClaim = {
      claimId,
      workerId: this.workerId,
      tenantId: descriptor.tenantId,
      projectId: descriptor.projectId,
      environment: descriptor.environment,
      serviceName: descriptor.serviceName,
      date: descriptor.date,
      segmentFilename: descriptor.segmentFilename,
      sha256Checksum: descriptor.sha256Checksum,
      claimedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    // 1. Try atomic file claim via 'wx' flag (O_CREAT | O_EXCL)
    let acquiredFile = false;
    try {
      const fd = fs.openSync(claimFilePath, 'wx', 0o640);
      try {
        fs.writeFileSync(fd, JSON.stringify(claimData, null, 2), 'utf8');
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      acquiredFile = true;
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'EEXIST') {
        // Claim file already exists. Check if it's expired.
        const recovered = this.tryRecoverExpiredClaim(claimFilePath, claimData, segmentKey, correlationId);
        if (recovered) {
          acquiredFile = true;
        } else {
          return null; // Active claim held by another worker
        }
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Failed to create claim file for ${descriptor.segmentFilename}: ${msg}`);
        return null;
      }
    }

    if (!acquiredFile) return null;

    // 2. If PostgreSQL is connected and healthy, also attempt pg_try_advisory_lock
    let hashInt64: bigint | undefined;
    if (this.prisma && !this.config.databaseUrl.includes('REPLACE_ME')) {
      try {
        // Derive signed 64-bit BigInt from top 15 hex chars
        hashInt64 = BigInt('0x' + keyHash.slice(0, 15));
        const res = await this.prisma.$queryRaw<Array<{ acquired: boolean }>>`
          SELECT pg_try_advisory_lock(${hashInt64}) AS acquired
        `;
        const acquiredDb = res[0]?.acquired === true;
        if (!acquiredDb) {
          // Release file claim since DB lock failed
          this.safeUnlink(claimFilePath);
          return null;
        }
      } catch (dbErr: unknown) {
        // If DB lock query fails or DB is not reachable, file claim still provides local/shared filesystem protection
        this.logger.debug(`PostgreSQL advisory lock skipped: ${String(dbErr)}`);
      }
    }

    this.audit.recordSecurityEvent({
      eventType: 'COMPACTION_SEGMENT_CLAIMED',
      tenantId: descriptor.tenantId,
      projects: [descriptor.projectId],
      correlationId,
      detail: `Segment ${descriptor.segmentFilename} claimed by worker ${this.workerId} (claimId: ${claimId})`,
      metadata: { claimId, workerId: this.workerId, segmentFilename: descriptor.segmentFilename },
    });

    return {
      claimId,
      segmentKey,
      claimFilePath,
      hashInt64,
    };
  }

  /**
   * Releases a claim handle.
   */
  public async releaseClaim(handle: LockHandle): Promise<void> {
    // 1. Release file claim
    this.safeUnlink(handle.claimFilePath);

    // 2. Release DB advisory lock if acquired
    if (handle.hashInt64 !== undefined && this.prisma && !this.config.databaseUrl.includes('REPLACE_ME')) {
      try {
        await this.prisma.$queryRaw`SELECT pg_advisory_unlock(${handle.hashInt64})`;
      } catch (err: unknown) {
        this.logger.debug(`Failed to release pg advisory lock: ${String(err)}`);
      }
    }
  }

  /**
   * Recovers stale claims whose expiresAt has elapsed.
   */
  public recoverStaleClaims(): number {
    let recoveredCount = 0;
    try {
      const claimsDir = this.pathSafety.getClaimsDirectory();
      if (!fs.existsSync(claimsDir)) return 0;
      const files = fs.readdirSync(claimsDir).filter((f) => f.endsWith('.claim.json'));
      const now = Date.now();

      for (const file of files) {
        const fullPath = path.join(claimsDir, file);
        try {
          const raw = fs.readFileSync(fullPath, 'utf8');
          const data = JSON.parse(raw) as CompactionClaim;
          if (data.expiresAt && now > new Date(data.expiresAt).getTime()) {
            this.safeUnlink(fullPath);
            recoveredCount++;
            this.audit.recordSecurityEvent({
              eventType: 'COMPACTION_STALE_CLAIM_RECOVERED',
              tenantId: data.tenantId,
              projects: [data.projectId],
              detail: `Recovered expired claim for ${data.segmentFilename} from worker ${data.workerId}`,
            });
          }
        } catch {
          // If claim file is corrupted, remove it
          this.safeUnlink(fullPath);
          recoveredCount++;
        }
      }
    } catch (err: unknown) {
      this.logger.warn(`Failed scanning claims directory: ${String(err)}`);
    }
    return recoveredCount;
  }

  private tryRecoverExpiredClaim(
    claimFilePath: string,
    newClaim: CompactionClaim,
    segmentKey: string,
    correlationId?: string,
  ): boolean {
    try {
      const raw = fs.readFileSync(claimFilePath, 'utf8');
      const existing = JSON.parse(raw) as CompactionClaim;
      const now = Date.now();
      if (existing.expiresAt && now > new Date(existing.expiresAt).getTime()) {
        // Expired claim: atomically overwrite via temp file and rename
        const tmpPath = `${claimFilePath}.recov-${Date.now()}`;
        fs.writeFileSync(tmpPath, JSON.stringify(newClaim, null, 2), 'utf8');
        fs.renameSync(tmpPath, claimFilePath);
        this.audit.recordSecurityEvent({
          eventType: 'COMPACTION_STALE_CLAIM_RECOVERED',
          tenantId: existing.tenantId,
          projects: [existing.projectId],
          correlationId,
          detail: `Recovered expired claim for ${segmentKey} previously held by ${existing.workerId}`,
        });
        return true;
      }
    } catch {
      // If parsing fails, try overwriting
      try {
        fs.writeFileSync(claimFilePath, JSON.stringify(newClaim, null, 2), 'utf8');
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  private safeUnlink(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch {
      // Ignore cleanup error
    }
  }
}
