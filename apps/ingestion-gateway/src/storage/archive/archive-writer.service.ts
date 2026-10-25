import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { Injectable, Inject, Logger, OnModuleDestroy } from '@nestjs/common';
import {
  ARCHIVE_SEGMENT_REPOSITORY,
  type IArchiveSegmentRepository,
  type ArchiveSegmentRecord,
} from '../../metadata/repositories/archive-segment.repository.interface.js';
import type { ArchiveSegmentManifest } from '../storage.interface.js';

export const MAX_ARCHIVE_SEGMENT_BYTES = 100 * 1024 * 1024; // 100 MiB
const SAFE_NAME_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export interface ArchiveWriterOptions {
  archiveRoot?: string;
  maxSegmentSizeBytes?: number;
  instanceId?: string;
}

interface ActivePartitionState {
  dirPath: string;
  partIndex: number;
  currentFilename: string;
  currentSizeBytes: number;
  recordCount: number;
  firstEventTimestamp: string;
  lastEventTimestamp: string;
  startJournalOffset: number;
  endJournalOffset: number;
  journalSegment: string;
}

@Injectable()
export class ArchiveWriterService implements OnModuleDestroy {
  private readonly logger = new Logger(ArchiveWriterService.name);

  private readonly archiveRoot: string;
  private readonly maxSegmentBytes: number;
  private readonly instanceId: string;

  // Active open file descriptors per partition key: `${tenant}#${project}#${env}#${service}#${date}`
  private readonly activePartitions = new Map<string, ActivePartitionState>();
  private readonly openFds = new Map<string, number>();

  constructor(
    @Inject(ARCHIVE_SEGMENT_REPOSITORY)
    private readonly segmentRepo: IArchiveSegmentRepository,
    options?: ArchiveWriterOptions,
  ) {
    this.archiveRoot = options?.archiveRoot ?? process.env['ARCHIVE_ROOT'] ?? path.resolve(process.cwd(), 'data', 'archive');
    this.maxSegmentBytes =
      options?.maxSegmentSizeBytes ??
      Number.parseInt(process.env['ARCHIVE_MAX_SEGMENT_BYTES'] ?? String(MAX_ARCHIVE_SEGMENT_BYTES), 10);
    this.instanceId = options?.instanceId ?? process.env['INSTANCE_ID'] ?? `worker-${process.pid}`;
  }

  public async onModuleDestroy(): Promise<void> {
    await this.closeAll();
  }

  /**
   * Sanitizes and verifies path components against path traversal attacks.
   */
  public resolvePartitionDir(
    tenantId: string,
    projectId: string,
    environment: string,
    serviceName: string,
    date: string,
  ): string {
    const rawTenant = tenantId.toLowerCase().trim();
    const rawProject = projectId.toLowerCase().trim();
    const rawEnv = environment.toLowerCase().trim();
    const rawService = serviceName.toLowerCase().trim();

    if (!SAFE_NAME_REGEX.test(rawTenant)) {
      throw new Error(`Security Violation: Invalid tenant ID format "${tenantId}"`);
    }
    if (!SAFE_NAME_REGEX.test(rawProject)) {
      throw new Error(`Security Violation: Invalid project ID format "${projectId}"`);
    }
    if (!['production', 'staging', 'development', 'test', 'local'].includes(rawEnv)) {
      throw new Error(`Security Violation: Invalid environment "${environment}"`);
    }
    if (!SAFE_NAME_REGEX.test(rawService)) {
      throw new Error(`Security Violation: Invalid service name "${serviceName}"`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error(`Security Violation: Invalid date format "${date}". Expected YYYY-MM-DD.`);
    }

    const resolved = path.resolve(this.archiveRoot, rawTenant, rawProject, rawEnv, rawService, date);
    const rootResolved = path.resolve(this.archiveRoot);

    if (!resolved.startsWith(rootResolved + path.sep) && resolved !== rootResolved) {
      throw new Error(`Security Violation: Path traversal attempt detected outside archive root: "${resolved}"`);
    }

    return resolved;
  }

  /**
   * Appends canonical JSONL events from a committed WAL batch into their partition segment.
   */
  public async appendEvents(
    meta: {
      tenantId: string;
      projectId: string;
      environment: 'production' | 'staging' | 'development' | 'test' | 'local';
      serviceName: string;
      date: string;
      journalSegment: string;
      journalStartOffset: number;
      journalEndOffset: number;
    },
    events: Array<Record<string, unknown>>,
  ): Promise<void> {
    if (events.length === 0) return;

    const partitionKey = `${meta.tenantId}#${meta.projectId}#${meta.environment}#${meta.serviceName}#${meta.date}`;
    let state = this.activePartitions.get(partitionKey);

    if (!state) {
      state = this.initPartitionState(meta);
      this.activePartitions.set(partitionKey, state);
    }

    const dirPath = state.dirPath;
    let fd = this.openFds.get(partitionKey);
    if (fd === undefined) {
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true, mode: 0o750 });
      }
      const filePath = path.join(dirPath, state.currentFilename);
      fd = fs.openSync(filePath, 'a+');
      this.openFds.set(partitionKey, fd);
    }

    // Format events into JSONL buffer
    const lines: string[] = [];
    for (const evt of events) {
      const line = JSON.stringify(evt);
      lines.push(line);

      const ts = (evt['@timestamp'] as string) || new Date().toISOString();
      if (!state.firstEventTimestamp || ts < state.firstEventTimestamp) {
        state.firstEventTimestamp = ts;
      }
      if (!state.lastEventTimestamp || ts > state.lastEventTimestamp) {
        state.lastEventTimestamp = ts;
      }
    }

    const chunk = Buffer.from(lines.join('\n') + '\n', 'utf-8');
    fs.writeSync(fd, chunk);
    fs.fsyncSync(fd);

    state.currentSizeBytes += chunk.length;
    state.recordCount += events.length;
    state.endJournalOffset = meta.journalEndOffset;

    // Check 100 MiB rollover trigger
    if (state.currentSizeBytes >= this.maxSegmentBytes) {
      await this.finalizeSegment(partitionKey, meta);
    }
  }

  private initPartitionState(meta: {
    tenantId: string;
    projectId: string;
    environment: string;
    serviceName: string;
    date: string;
    journalSegment: string;
    journalStartOffset: number;
  }): ActivePartitionState {
    const dirPath = this.resolvePartitionDir(
      meta.tenantId,
      meta.projectId,
      meta.environment,
      meta.serviceName,
      meta.date,
    );

    let partIndex = 0;
    if (fs.existsSync(dirPath)) {
      const existing = fs.readdirSync(dirPath).filter((f) => /^segment-\d{4}\.jsonl$/.test(f));
      if (existing.length > 0) {
        existing.sort();
        const lastFile = existing[existing.length - 1]!;
        const match = /segment-(\d{4})\.jsonl/.exec(lastFile);
        if (match && match[1]) {
          partIndex = Number.parseInt(match[1], 10);
          const fullPath = path.join(dirPath, lastFile);
          const stat = fs.statSync(fullPath);
          // If existing segment already reached max size, roll to next part
          if (stat.size >= this.maxSegmentBytes) {
            partIndex++;
          }
        }
      }
    }

    const currentFilename = `segment-${partIndex.toString().padStart(4, '0')}.jsonl`;
    const targetFile = path.join(dirPath, currentFilename);
    let currentSizeBytes = 0;
    if (fs.existsSync(targetFile)) {
      currentSizeBytes = fs.statSync(targetFile).size;
    }

    return {
      dirPath,
      partIndex,
      currentFilename,
      currentSizeBytes,
      recordCount: 0,
      firstEventTimestamp: '',
      lastEventTimestamp: '',
      startJournalOffset: meta.journalStartOffset,
      endJournalOffset: meta.journalStartOffset,
      journalSegment: meta.journalSegment,
    };
  }

  /**
   * Finalizes an active segment: fsync, computes SHA-256, writes .manifest.json, locks read-only, records in DB.
   */
  public async finalizeSegment(
    partitionKey: string,
    meta: {
      tenantId: string;
      projectId: string;
      environment: 'production' | 'staging' | 'development' | 'test' | 'local';
      serviceName: string;
      date: string;
    },
  ): Promise<ArchiveSegmentManifest | null> {
    const state = this.activePartitions.get(partitionKey);
    if (!state || state.recordCount === 0) return null;

    const fd = this.openFds.get(partitionKey);
    if (fd !== undefined) {
      fs.fsyncSync(fd);
      fs.closeSync(fd);
      this.openFds.delete(partitionKey);
    }

    const segmentPath = path.join(state.dirPath, state.currentFilename);
    const fileBuf = fs.readFileSync(segmentPath);
    const sha256Checksum = crypto.createHash('sha256').update(fileBuf).digest('hex');
    const finalizedAt = new Date().toISOString();

    const manifest: ArchiveSegmentManifest = {
      manifest_version: '1.0',
      tenant_id: meta.tenantId,
      project_id: meta.projectId,
      environment: meta.environment,
      service_name: meta.serviceName,
      date: meta.date,
      segment_filename: state.currentFilename,
      record_count: state.recordCount,
      byte_size: fileBuf.length,
      sha256_checksum: sha256Checksum,
      first_event_timestamp: state.firstEventTimestamp || finalizedAt,
      last_event_timestamp: state.lastEventTimestamp || finalizedAt,
      finalized_at: finalizedAt,
      writer_instance_id: this.instanceId,
      journal_commit_range: {
        segment_id: state.journalSegment,
        start_offset: state.startJournalOffset,
        end_offset: state.endJournalOffset,
      },
    };

    // Atomic manifest write: write tmp file with fsync then rename
    const manifestFilename = state.currentFilename.replace('.jsonl', '.manifest.json');
    const tmpManifestPath = path.join(state.dirPath, `${manifestFilename}.tmp`);
    const finalManifestPath = path.join(state.dirPath, manifestFilename);

    const manifestBuf = Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8');
    const tmpFd = fs.openSync(tmpManifestPath, 'w');
    try {
      fs.writeSync(tmpFd, manifestBuf);
      fs.fsyncSync(tmpFd);
    } finally {
      fs.closeSync(tmpFd);
    }

    fs.renameSync(tmpManifestPath, finalManifestPath);

    // Lock file permissions to read-only (0o440)
    try {
      fs.chmodSync(segmentPath, 0o440);
      fs.chmodSync(finalManifestPath, 0o440);
    } catch {
      // Windows file permission adjustments may be restricted; safe ignore
    }

    // Persist segment catalog record in repository
    const dbRecord: ArchiveSegmentRecord = {
      id: crypto.randomUUID(),
      tenantId: manifest.tenant_id,
      projectId: manifest.project_id,
      environment: manifest.environment,
      serviceName: manifest.service_name,
      date: manifest.date,
      segmentFilename: manifest.segment_filename,
      recordCount: manifest.record_count,
      byteSize: manifest.byte_size,
      sha256Checksum: manifest.sha256_checksum,
      firstEventTimestamp: new Date(manifest.first_event_timestamp),
      lastEventTimestamp: new Date(manifest.last_event_timestamp),
      finalizedAt: new Date(manifest.finalized_at),
      writerInstanceId: manifest.writer_instance_id,
      journalSegmentId: manifest.journal_commit_range.segment_id,
      journalStartOffset: BigInt(manifest.journal_commit_range.start_offset),
      journalEndOffset: BigInt(manifest.journal_commit_range.end_offset),
    };

    await this.segmentRepo.saveSegment(dbRecord);

    this.logger.log(
      `Finalized immutable archive segment: ${state.currentFilename} (${manifest.record_count} events, ${manifest.byte_size} bytes, sha256=${sha256Checksum.slice(0, 12)}...)`,
    );

    // Roll to next segment index
    state.partIndex++;
    state.currentFilename = `segment-${state.partIndex.toString().padStart(4, '0')}.jsonl`;
    state.currentSizeBytes = 0;
    state.recordCount = 0;
    state.firstEventTimestamp = '';
    state.lastEventTimestamp = '';
    state.startJournalOffset = state.endJournalOffset;

    return manifest;
  }

  public async closeAll(): Promise<void> {
    for (const [key, fd] of this.openFds.entries()) {
      try {
        fs.fsyncSync(fd);
        fs.closeSync(fd);
      } catch {}
    }
    this.openFds.clear();
  }
}
