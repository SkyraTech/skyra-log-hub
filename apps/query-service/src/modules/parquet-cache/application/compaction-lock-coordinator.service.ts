import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { Injectable, Logger, Optional } from '@nestjs/common';
import pg from 'pg';
import { ParquetPathSafetyService } from '../infrastructure/filesystem/parquet-path-safety.service.js';
import { QueryConfigService } from '../../../config/query-config.service.js';
import { QueryAuditService } from '../../audit/query-audit.service.js';
import { PrismaService } from '../../../metadata/prisma.service.js';
import type { TrustedArchiveSegmentDescriptor } from '../../archive-discovery/domain/archive-segment-descriptor.model.js';
import type { CompactionClaim, LockHandle } from '../domain/compaction.types.js';

const { Client } = pg;

export function readOnlyDatabaseUrl(databaseUrl: string): string {
  try {
    const url = new URL(databaseUrl);
    url.searchParams.set('options', '-c default_transaction_read_only=on');
    return url.href;
  } catch {
    return databaseUrl;
  }
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

  public isDatabaseCoordinated(): boolean {
    const url = this.config.databaseUrl;
    if (!url || url.includes('REPLACE_ME')) return false;
    if (
      this.config.nodeEnv === 'test' &&
      process.env.SKYRA_ISOLATED_TEST_ENV !== 'true' &&
      !this.prisma
    ) {
      return false;
    }
    return url.startsWith('postgresql://') || url.startsWith('postgres://');
  }

  public buildSegmentKey(descriptor: TrustedArchiveSegmentDescriptor): string {
    return `${descriptor.tenantId}:${descriptor.projectId}:${descriptor.environment}:${descriptor.serviceName}:${descriptor.date}:${descriptor.segmentFilename}`;
  }

  public buildKeyHash(segmentKey: string): string {
    return crypto.createHash('sha256').update(segmentKey).digest('hex');
  }

  /**
   * Attempts to claim a segment for compaction with dual-layer coordination:
   * 1. Atomic local/shared filesystem lease with fencing generation.
   * 2. Dedicated-session PostgreSQL advisory lock (mandatory fail-closed in distributed mode).
   *
   * Returns a LockHandle if claimed successfully, or null if contention or coordination error occurs.
   */
  public async claimSegment(
    descriptor: TrustedArchiveSegmentDescriptor,
    correlationId?: string,
  ): Promise<LockHandle | null> {
    const segmentKey = this.buildSegmentKey(descriptor);
    const keyHash = this.buildKeyHash(segmentKey);
    const claimsDir = this.pathSafety.getClaimsDirectory();
    this.pathSafety.ensureDirectoryExists(claimsDir);
    const claimFilePath = path.join(claimsDir, `${keyHash}.claim.json`);
    const ttlMs = this.config.compactionLockTtlMs;

    const claimId = crypto.randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs);
    const topology = this.isDatabaseCoordinated()
      ? 'DISTRIBUTED_POSTGRES_COORDINATED'
      : 'STANDALONE_FILESYSTEM';

    let generation = 1;
    let acquiredFile = false;

    // 1. Try atomic file claim via 'wx' flag (O_CREAT | O_EXCL)
    const initialClaimData: CompactionClaim = {
      claimId,
      generation,
      workerId: this.workerId,
      tenantId: descriptor.tenantId,
      projectId: descriptor.projectId,
      environment: descriptor.environment,
      serviceName: descriptor.serviceName,
      date: descriptor.date,
      segmentFilename: descriptor.segmentFilename,
      sha256Checksum: descriptor.sha256Checksum,
      claimedAt: now.toISOString(),
      lastHeartbeatAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      leaseTtlMs: ttlMs,
      status: 'ACTIVE',
      topology,
    };

    try {
      const fd = fs.openSync(claimFilePath, 'wx', 0o640);
      try {
        fs.writeFileSync(fd, JSON.stringify(initialClaimData, null, 2), 'utf8');
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      acquiredFile = true;
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'EEXIST') {
        // Claim file already exists. Inspect if it is genuinely expired.
        const takeover = this.tryRecoverExpiredClaim(
          claimFilePath,
          initialClaimData,
          segmentKey,
          correlationId,
        );
        if (takeover.acquired) {
          acquiredFile = true;
          generation = takeover.generation;
        } else {
          return null; // Active claim held by another live worker
        }
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Failed to create claim file for ${descriptor.segmentFilename}: ${msg}`);
        return null;
      }
    }

    if (!acquiredFile) return null;

    // 2. Dedicated-session PostgreSQL advisory lock
    let dbClient: pg.Client | undefined;
    let hashInt64: bigint | undefined;

    if (this.isDatabaseCoordinated()) {
      hashInt64 = BigInt('0x' + keyHash.slice(0, 15));
      const client = new Client({
        connectionString: readOnlyDatabaseUrl(this.config.databaseUrl),
        connectionTimeoutMillis: 5000,
      });

      try {
        await client.connect();
        const res = await client.query<{ acquired: boolean }>(
          'SELECT pg_try_advisory_lock($1) AS acquired',
          [hashInt64.toString()],
        );
        const acquiredDb = res.rows[0]?.acquired === true;

        if (!acquiredDb) {
          // Lock contention in PostgreSQL: another node holds the lock.
          // Clean up own claim file and fail closed.
          try {
            await client.end();
          } catch {
            // ignore
          }
          this.safeReleaseOwnClaimFile(claimFilePath, claimId, generation);
          return null;
        }

        dbClient = client;
      } catch (dbErr: unknown) {
        // MANDATORY FAIL-CLOSED: If DB coordination is configured and fails,
        // we must never fall back to unsafe multi-instance filesystem claims.
        try {
          await client.end();
        } catch {
          // ignore
        }
        this.safeReleaseOwnClaimFile(claimFilePath, claimId, generation);
        const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
        this.logger.error(`PostgreSQL advisory lock coordination failed (failing closed): ${msg}`);
        this.audit.recordSecurityEvent({
          eventType: 'COMPACTION_LOCK_COORDINATION_FAILED',
          tenantId: descriptor.tenantId,
          projects: [descriptor.projectId],
          correlationId,
          detail: `Database coordination failed for ${descriptor.segmentFilename}: ${msg}`,
        });
        return null;
      }
    }

    this.audit.recordSecurityEvent({
      eventType: 'COMPACTION_SEGMENT_CLAIMED',
      tenantId: descriptor.tenantId,
      projects: [descriptor.projectId],
      correlationId,
      detail: `Segment ${descriptor.segmentFilename} claimed by worker ${this.workerId} (claimId: ${claimId}, gen: ${generation}, topology: ${topology})`,
      metadata: {
        claimId,
        generation,
        workerId: this.workerId,
        segmentFilename: descriptor.segmentFilename,
        topology,
      },
    });

    return {
      claimId,
      generation,
      segmentKey,
      claimFilePath,
      leaseTtlMs: ttlMs,
      hashInt64,
      dbClient,
    };
  }

  /**
   * Heartbeat renewal: extends the lease for an active worker.
   * Fails closed (returns false) if ownership has been superseded or DB session lost.
   */
  public async renewLease(handle: LockHandle, extensionMs?: number): Promise<boolean> {
    if (handle.released) return false;
    if (!fs.existsSync(handle.claimFilePath)) return false;

    try {
      const raw = fs.readFileSync(handle.claimFilePath, 'utf8');
      const claim = JSON.parse(raw) as CompactionClaim;

      // Ownership fencing check
      if (claim.claimId !== handle.claimId || claim.generation !== handle.generation) {
        this.logger.warn(
          `Heartbeat rejected for ${handle.segmentKey}: claim owned by generation ${claim.generation} (expected ${handle.generation})`,
        );
        return false;
      }

      // Verify DB connection liveness if coordinated
      if (handle.dbClient) {
        try {
          await handle.dbClient.query('SELECT 1');
        } catch {
          this.logger.error(`Database session connection lost during lease renewal for ${handle.segmentKey}`);
          return false;
        }
      }

      const ext = extensionMs ?? handle.leaseTtlMs;
      const now = Date.now();
      const updatedClaim: CompactionClaim = {
        ...claim,
        lastHeartbeatAt: new Date(now).toISOString(),
        expiresAt: new Date(now + ext).toISOString(),
      };

      const tmpPath = `${handle.claimFilePath}.renew-${handle.claimId}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(updatedClaim, null, 2), 'utf8');
      fs.renameSync(tmpPath, handle.claimFilePath);
      return true;
    } catch (err: unknown) {
      this.logger.warn(`Failed to renew lease for ${handle.segmentKey}: ${String(err)}`);
      return false;
    }
  }

  /**
   * Pre-publication fencing verification: confirms this handle still strictly owns the lease.
   */
  public async verifyOwnership(handle: LockHandle): Promise<boolean> {
    if (handle.released) return false;
    if (!fs.existsSync(handle.claimFilePath)) return false;

    try {
      const raw = fs.readFileSync(handle.claimFilePath, 'utf8');
      const claim = JSON.parse(raw) as CompactionClaim;

      // 1. Fencing token & ID match
      if (claim.claimId !== handle.claimId || claim.generation !== handle.generation) {
        return false;
      }

      // 2. Lease expiry check
      if (new Date(claim.expiresAt).getTime() <= Date.now()) {
        return false;
      }

      // 3. PostgreSQL session check if attached
      if (handle.dbClient) {
        try {
          await handle.dbClient.query('SELECT 1');
        } catch {
          return false;
        }
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Safely releases a claim handle.
   * Guarantees that a stale worker cannot delete a newer worker's replacement claim file.
   */
  public async releaseClaim(handle: LockHandle): Promise<void> {
    handle.released = true;

    // 1. Release file claim safely verifying ownership
    this.safeReleaseOwnClaimFile(handle.claimFilePath, handle.claimId, handle.generation);

    // 2. Release dedicated PostgreSQL session advisory lock & close client
    if (handle.dbClient && handle.hashInt64 !== undefined) {
      try {
        await handle.dbClient.query('SELECT pg_advisory_unlock($1)', [handle.hashInt64.toString()]);
      } catch (err: unknown) {
        this.logger.debug(`Failed to release pg advisory lock: ${String(err)}`);
      } finally {
        try {
          await handle.dbClient.end();
        } catch {
          // ignore
        }
        handle.dbClient = undefined;
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
              detail: `Recovered expired claim for ${data.segmentFilename} from worker ${data.workerId} (gen: ${data.generation})`,
            });
          }
        } catch {
          // Corrupted claim file
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
  ): { acquired: boolean; generation: number } {
    try {
      const raw = fs.readFileSync(claimFilePath, 'utf8');
      const existing = JSON.parse(raw) as CompactionClaim;
      const now = Date.now();

      if (existing.expiresAt && now > new Date(existing.expiresAt).getTime()) {
        const nextGen = (existing.generation ?? 1) + 1;
        const claimWithGen: CompactionClaim = {
          ...newClaim,
          generation: nextGen,
        };

        const tmpPath = `${claimFilePath}.recov-${Date.now()}-${claimWithGen.claimId}.tmp`;
        fs.writeFileSync(tmpPath, JSON.stringify(claimWithGen, null, 2), 'utf8');
        fs.renameSync(tmpPath, claimFilePath);

        this.audit.recordSecurityEvent({
          eventType: 'COMPACTION_STALE_CLAIM_RECOVERED',
          tenantId: existing.tenantId,
          projects: [existing.projectId],
          correlationId,
          detail: `Recovered expired claim for ${segmentKey} previously held by ${existing.workerId} (gen: ${nextGen})`,
        });
        return { acquired: true, generation: nextGen };
      }
    } catch {
      // If parsing failed (corrupt claim), attempt safe atomic overwrite
      try {
        const nextGen = 1;
        const claimWithGen: CompactionClaim = { ...newClaim, generation: nextGen };
        const tmpPath = `${claimFilePath}.recov-corrupt-${Date.now()}.tmp`;
        fs.writeFileSync(tmpPath, JSON.stringify(claimWithGen, null, 2), 'utf8');
        fs.renameSync(tmpPath, claimFilePath);
        return { acquired: true, generation: nextGen };
      } catch {
        return { acquired: false, generation: 0 };
      }
    }
    return { acquired: false, generation: 0 };
  }

  private safeReleaseOwnClaimFile(
    claimFilePath: string,
    expectedClaimId: string,
    expectedGeneration: number,
  ): void {
    try {
      if (!fs.existsSync(claimFilePath)) return;
      const raw = fs.readFileSync(claimFilePath, 'utf8');
      const parsed = JSON.parse(raw) as CompactionClaim;

      if (parsed.claimId === expectedClaimId && parsed.generation === expectedGeneration) {
        fs.unlinkSync(claimFilePath);
      } else {
        this.logger.warn(
          `Stale release skipped for ${claimFilePath}: owned by claim ${parsed.claimId} (gen ${parsed.generation}), expected ${expectedClaimId} (gen ${expectedGeneration})`,
        );
        this.audit.recordSecurityEvent({
          eventType: 'COMPACTION_STALE_RELEASE_IGNORED',
          tenantId: parsed.tenantId,
          projects: [parsed.projectId],
          detail: `Ignored stale release attempt by worker for claim ${expectedClaimId}`,
        });
      }
    } catch {
      // ignore
    }
  }

  private safeUnlink(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch {
      // ignore
    }
  }
}
