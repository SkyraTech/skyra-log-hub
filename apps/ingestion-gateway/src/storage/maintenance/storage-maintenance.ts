import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import type { PoolClient } from 'pg';
import { deserializeWalFrame } from '../wal/wal-frame.js';
import type { WalFrame } from '../storage.interface.js';
import { JournalOwnershipManager, parseLockContent } from '../wal/journal-ownership.js';
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const segment = /^journal-([0-9]{4,10})\.wal$/;
const hash = (data: Buffer | string) => crypto.createHash('sha256').update(data).digest('hex');
export const RETENTION_SEQUENCE = '.retention-sequence.json';
interface ArchiveProof {
    relative: string;
    sha: string;
    size: number;
    manifestSha: string;
    catalogId: string;
}
interface FrameProof {
    tenant: string;
    project: string;
    batch: string;
    digest: string;
    events: number;
    bytes: number;
    period: string;
    receiptId: string;
    journalId: string;
    ids: string[];
    tenantPresent: boolean[];
    archives: ArchiveProof[];
}
interface Retirement {
    version: 1;
    id: string;
    journalId: string;
    ownerId: string;
    segment: string;
    retired: string;
    sha: string;
    bytes: number;
    frames: FrameProof[];
}
export interface MaintenanceOptions {
    store: string;
    allowedParent: string;
    clusterId: string;
    ownerId: string;
    apply?: boolean;
    minAgeMs?: number;
    maxSegments?: number;
    maxSegmentBytes?: number;
    maxWorkBytes?: number;
    maxFrames?: number;
    maxTemporaryFiles?: number;
    signal?: AbortSignal;
    fault?: (stage: string) => Promise<void>;
}
export interface MaintenanceReport {
    dryRun: boolean;
    retiredSegments: number;
    reclaimedWalBytes: number;
    reclaimedTemporaryBytes: number;
    temporaryFilesRemoved: number;
    resumed: number;
    eligible: {
        segment: string;
        bytes: number;
    }[];
    retained: {
        segment: string;
        reason: string;
    }[];
    directoryFsync: 'supported' | 'not-supported-on-windows';
    ledgerPolicy: string;
}
/** Explicit offline maintenance. No HTTP path, timer, ledger deletion or owner DB credentials. */
export class StorageMaintenance {
    private busy = false;
    private wal = '';
    private archive = '';
    private journalId = '';
    private work = 0;
    private o!: MaintenanceOptions;
    private readonly limits = { segments: 2, segmentBytes: 16 * 1024 * 1024, workBytes: 128 * 1024 * 1024, frames: 2048, temporary: 8 };
    constructor(private readonly db: PoolClient) { }
    private regular(file: string, max = Number.MAX_SAFE_INTEGER) { const s = fs.lstatSync(file); if (!s.isFile() || s.isSymbolicLink() || s.nlink !== 1 || s.size > max)
        throw Error('Unverified regular file or size bound'); return s; }
    private directory(file: string) { const s = fs.lstatSync(file); if (!s.isDirectory() || s.isSymbolicLink() || fs.realpathSync(file) !== path.resolve(file))
        throw Error('Redirected storage directory'); }
    private read(file: string, max: number) { this.regular(file, max); const data = fs.readFileSync(file); this.work += data.length; if (this.work > this.limits.workBytes)
        throw Error('Maintenance work-byte limit'); return data; }
    private check() { if (this.o.signal?.aborted)
        throw Error('Maintenance cancelled'); }
    private syncDirectory(dir: string) { if (process.platform === 'win32')
        return; const fd = fs.openSync(dir, 'r'); try {
        fs.fsyncSync(fd);
    }
    finally {
        fs.closeSync(fd);
    } }
    private durable(file: string, data: Buffer) { if (fs.existsSync(file))
        throw Error('Maintenance destination exists'); const fd = fs.openSync(file, 'wx', 0o600); try {
        fs.writeFileSync(fd, data);
        fs.fsyncSync(fd);
    }
    finally {
        fs.closeSync(fd);
    } this.syncDirectory(path.dirname(file)); }
    private async fault(stage: string) { this.check(); await this.o.fault?.(stage); this.check(); }
    private entries(dir: string, max = 4096) { const result: string[] = []; const d = fs.opendirSync(dir); try {
        let entry;
        while ((entry = d.readSync())) {
            if (result.length >= max)
                throw Error('Directory entry bound');
            result.push(entry.name);
        }
    }
    finally {
        d.closeSync();
    } return result.sort(); }
    private archiveFile(relative: string) { if (path.isAbsolute(relative) || relative.includes('\\') || relative.split('/').some(p => !p || p === '.' || p === '..' || !/^[-a-z0-9.]+$/.test(p)))
        throw Error('Unsafe successor path'); const parts = relative.split('/'); let current = this.archive; for (const part of parts.slice(0, -1)) {
        current = path.join(current, part);
        this.directory(current);
    } const file = path.join(this.archive, ...parts); if (!file.startsWith(this.archive + path.sep))
        throw Error('Successor escaped root'); return file; }
    private async admission(tenant: string, project: string, batch: string) { const rows = (await this.db.query('SELECT *,period::text AS original_period FROM quota_admissions WHERE tenant_id=$1 AND project_id=$2 AND batch_id=$3', [tenant, project, batch])).rows; if (rows.length !== 1)
        throw Error('Missing permanent admission identity'); const r = rows[0]; if (r.state !== 'COMMITTED' || r.journal_id !== this.journalId || !r.receipt || r.receipt.receiptId !== r.receipt_id || r.receipt.tenantId !== tenant || r.receipt.projectId !== project || r.receipt.batchId !== batch || r.receipt.contentDigest !== r.digest || r.receipt.acceptedCount !== r.events)
        throw Error('Unresolved or inconsistent admission/receipt'); return r; }
    private async catalog(relative: string, bytes: Buffer) {
        const parts = relative.split('/');
        if (parts.length !== 6)
            throw Error('Invalid archive partition');
        const [tenant, project, environment, service, date, filename] = parts;
        const rows = (await this.db.query('SELECT * FROM archive_segments WHERE tenant_id=$1 AND project_id=$2 AND environment=$3 AND service_name=$4 AND date=$5 AND segment_filename=$6', [tenant, project, environment, service, date, filename])).rows;
        if (rows.length !== 1)
            throw Error('Archive catalog not committed');
        const c = rows[0], manifestRelative = relative.replace(/\.jsonl$/, '.manifest.json'), manifestFile = this.archiveFile(manifestRelative), raw = this.read(manifestFile, 65536), m = JSON.parse(raw.toString());
        if (m.manifest_version !== '1.0' || m.tenant_id !== tenant || m.project_id !== project || m.environment !== environment || m.service_name !== service || m.date !== date || m.segment_filename !== filename || m.sha256_checksum !== hash(bytes) || c.sha256_checksum !== m.sha256_checksum || Number(c.byte_size) !== bytes.length || m.byte_size !== bytes.length || m.record_count !== c.record_count)
            throw Error('Archive manifest/catalog mismatch');
        const lines = bytes.toString('utf8').trimEnd().split('\n').map(line => JSON.parse(line));
        if (lines.length !== c.record_count || lines.some(e => e.skyra?.tenant_id !== tenant || e.skyra?.project_id !== project || e.service?.environment !== environment || e.service?.name !== service || e['@timestamp']?.slice(0, 10) !== date))
            throw Error('Archive scope/count mismatch');
        const times = lines.map(e => e['@timestamp']).sort();
        if (m.first_event_timestamp !== times[0] || m.last_event_timestamp !== times.at(-1) || new Date(c.first_event_timestamp).getTime() !== Date.parse(times[0]) || new Date(c.last_event_timestamp).getTime() !== Date.parse(times.at(-1)!))
            throw Error('Archive time bounds mismatch');
        return { proof: { relative, sha: hash(bytes), size: bytes.length, manifestSha: hash(raw), catalogId: c.id } as ArchiveProof, events: lines, manifestFile };
    }
    private async frameProof(f: WalFrame): Promise<FrameProof> {
        const r = await this.admission(f.tenantId, f.projectId, f.batchId);
        if (r.digest !== f.contentDigestSha256 || r.events !== f.eventCount || BigInt(r.bytes) !== BigInt(f.payload.length))
            throw Error('Ledger/WAL digest or charge mismatch');
        const events = JSON.parse(f.payload.toString());
        if (!Array.isArray(events) || events.length !== f.eventCount || events.length > 5000)
            throw Error('Invalid bounded event array');
        const groups = new Map<string, any[]>(), ids: string[] = [], tenantPresent: boolean[] = [];
        for (const original of events) {
            const id = original.event?.id;
            if (typeof id !== 'string' || !uuid.test(id) || ids.includes(id) || original.skyra?.project_id !== f.projectId || original.skyra?.tenant_id !== undefined && original.skyra.tenant_id !== f.tenantId)
                throw Error('Frame event identity/scope mismatch');
            ids.push(id);
            tenantPresent.push(Object.hasOwn(original.skyra, 'tenant_id'));
            const event = { ...original, skyra: { ...original.skyra, tenant_id: f.tenantId } }, parts = [f.tenantId, f.projectId, event.service?.environment, event.service?.name, event['@timestamp']?.slice(0, 10)];
            if (parts.some(p => typeof p !== 'string' || p.length > 128 || !/^([a-z0-9]+(-[a-z0-9]+)*)$/.test(p)))
                throw Error('Unsafe event partition');
            const relative = parts.join('/') + '/batch-' + f.batchId + '.jsonl';
            groups.set(relative, [...(groups.get(relative) ?? []), event]);
        }
        const archives: ArchiveProof[] = [];
        for (const [relative, rows] of groups) {
            const file = this.archiveFile(relative), bytes = this.read(file, this.limits.segmentBytes), wanted = Buffer.from(rows.map(e => JSON.stringify(e)).join('\n') + '\n');
            if (!bytes.equals(wanted))
                throw Error('Archive differs from acknowledged canonical events');
            archives.push((await this.catalog(relative, bytes)).proof);
        }
        return { tenant: f.tenantId, project: f.projectId, batch: f.batchId, digest: r.digest, events: r.events, bytes: Number(r.bytes), period: r.original_period, receiptId: r.receipt_id, journalId: r.journal_id, ids, tenantPresent, archives };
    }
    private async verifyProof(p: FrameProof) {
        const r = await this.admission(p.tenant, p.project, p.batch);
        if (r.digest !== p.digest || r.events !== p.events || Number(r.bytes) !== p.bytes || r.original_period !== p.period || r.receipt_id !== p.receiptId || r.journal_id !== p.journalId || p.ids.length !== p.events || p.tenantPresent.length !== p.events)
            throw Error('Retirement identity proof changed');
        const events = new Map<string, any>();
        for (const a of p.archives) {
            const file = this.archiveFile(a.relative), bytes = this.read(file, this.limits.segmentBytes), result = await this.catalog(a.relative, bytes);
            if (hash(bytes) !== a.sha || bytes.length !== a.size || result.proof.manifestSha !== a.manifestSha || result.proof.catalogId !== a.catalogId)
                throw Error('Retirement successor proof changed');
            for (const e of result.events) {
                if (events.has(e.event.id))
                    throw Error('Duplicate successor event');
                events.set(e.event.id, e);
            }
            if (this.o.apply)
                for (const target of [file, result.manifestFile]) {
                    const fd = fs.openSync(target, 'r+');
                    try {
                        fs.fsyncSync(fd);
                    }
                    finally {
                        fs.closeSync(fd);
                    }
                }
            this.syncDirectory(path.dirname(file));
        }
        const original = p.ids.map((id, i) => { const e = events.get(id); if (!e)
            throw Error('Missing acknowledged successor event'); const v = { ...e, skyra: { ...e.skyra } }; if (!p.tenantPresent[i])
            delete v.skyra.tenant_id; return v; });
        const payload = Buffer.from(JSON.stringify(original));
        if (payload.length !== p.bytes || 'sha256:' + hash(payload) !== p.digest)
            throw Error('Successors cannot reconstruct original admission digest');
    }
    private async locks<T>(frames: FrameProof[], action: () => Promise<T>) { const keys = [...new Set(frames.map(p => 'quota/' + p.tenant + '/' + p.project))].sort(), held: string[] = []; try {
        for (const key of keys) {
            const r = await this.db.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked', [key]);
            if (!r.rows[0]?.locked)
                throw Error('Project accounting lock busy');
            held.push(key);
        }
        return await action();
    }
    finally {
        for (const key of held.reverse())
            await this.db.query('SELECT pg_advisory_unlock(hashtextextended($1,0))', [key]);
    } }
    private async cleanTemporary(frames: FrameProof[], report: MaintenanceReport) {
        const seen = new Set<string>();
        let backlog = false;
        for (const f of frames)
            for (const a of f.archives)
                for (const relative of [a.relative, a.relative.replace(/\.jsonl$/, '.manifest.json')]) {
                    const final = this.archiveFile(relative), directory = path.dirname(final), base = path.basename(final);
                    for (const name of this.entries(directory, 1024)) {
                        if (!name.startsWith(base + '.') || !name.endsWith('.tmp'))
                            continue;
                        const file = path.join(directory, name);
                        if (seen.has(file))
                            continue;
                        seen.add(file);
                        const id = name.slice(base.length + 1, -4);
                        if (!uuid.test(id))
                            throw Error('Unknown publication intermediate retained');
                        const stat = this.regular(file, this.limits.segmentBytes), data = this.read(file, this.limits.segmentBytes), successor = this.read(final, this.limits.segmentBytes);
                        if (!data.equals(successor))
                            throw Error('Unproven publication intermediate retained');
                        if (Date.now() - stat.mtimeMs < (this.o.minAgeMs ?? 86400000))
                            throw Error('Publication intermediate younger than minimum');
                        if (!this.o.apply)
                            continue;
                        if (report.temporaryFilesRemoved >= this.limits.temporary) {
                            backlog = true;
                            continue;
                        }
                        this.check();
                        fs.unlinkSync(file);
                        this.syncDirectory(directory);
                        report.temporaryFilesRemoved++;
                        report.reclaimedTemporaryBytes += stat.size;
                    }
                }
        if (backlog)
            throw Error('Bounded publication cleanup backlog; segment retained');
    }
    private watermark(name: string) { const n = Number(segment.exec(name)?.[1]); if (!Number.isSafeInteger(n) || n < 0)
        throw Error('Invalid sealed segment sequence'); const target = path.join(this.wal, RETENTION_SEQUENCE); let next = n + 1; if (fs.existsSync(target)) {
        const old = JSON.parse(this.read(target, 1024).toString());
        if (old.version !== 1 || !Number.isSafeInteger(old.nextIndex) || old.nextIndex < 0)
            throw Error('Invalid retention watermark');
        if (old.nextIndex >= next)
            return;
        next = Math.max(next, old.nextIndex);
    } const tmp = target + '.new'; if (fs.existsSync(tmp))
        throw Error('Uncertain retention watermark staging retained'); this.durable(tmp, Buffer.from(JSON.stringify({ version: 1, nextIndex: next }))); fs.renameSync(tmp, target); this.syncDirectory(this.wal); }
    private encode(p: Retirement) { const body = JSON.stringify(p); const data = Buffer.from(JSON.stringify({ sha: hash(body), proof: p })); if (data.length > 8 * 1024 * 1024)
        throw Error('Retirement proof size bound'); return data; }
    private async verifySource(bytes: Buffer, p: Retirement) {
        if (bytes.length !== p.bytes || hash(bytes) !== p.sha)
            throw Error('Retirement source integrity mismatch');
        let offset = 0, index = 0;
        while (offset < bytes.length) {
            const parsed = deserializeWalFrame(bytes.subarray(offset), offset);
            if (!parsed.valid || !parsed.frame || parsed.bytesConsumed <= 0 || index >= p.frames.length)
                throw Error('Retirement source frame proof invalid');
            const actual = await this.frameProof(parsed.frame);
            if (JSON.stringify(actual) !== JSON.stringify(p.frames[index]))
                throw Error('Retirement proof does not describe source frames');
            offset += parsed.bytesConsumed;
            index++;
        }
        if (index !== p.frames.length)
            throw Error('Retirement frame proof count mismatch');
    }
    private async verifyConsumerReferences():Promise<void>{
        // Existing checkpoint rows have no journal/tenant namespace. Their safety
        // cannot be inferred from a matching filename in another owned journal.
        const rows=(await this.db.query('SELECT id FROM ingestion_checkpoints LIMIT 1')).rows;
        if(rows.length)throw Error('Unscoped consumer checkpoint requires explicit retention proof; WAL retained');
    }
    private async finish(p: Retirement, record: string, report: MaintenanceReport) {
        await this.locks(p.frames, async () => {
            await this.verifyConsumerReferences();
            for (const frame of p.frames) await this.verifyProof(frame);
            const source=path.join(this.wal,p.segment),retired=path.join(this.wal,p.retired);
            if(fs.existsSync(source)&&fs.existsSync(retired))throw Error('Ambiguous retirement names retained');
            if(fs.existsSync(source)) {
                await this.verifySource(this.read(source,this.limits.segmentBytes),p);
                await this.fault('before-rename');
                fs.renameSync(source,retired);
                await this.fault('after-rename');
                this.syncDirectory(this.wal);
            }
            if(fs.existsSync(retired)) {
                await this.verifySource(this.read(retired,this.limits.segmentBytes),p);
                for(const frame of p.frames)await this.verifyProof(frame);
                await this.verifyConsumerReferences();
                await this.fault('before-unlink');
                fs.unlinkSync(retired);
                report.reclaimedWalBytes+=p.bytes;
                await this.fault('after-unlink');
                this.syncDirectory(this.wal);
            }
            await this.fault('before-proof-cleanup');
            this.regular(record,8*1024*1024);
            fs.unlinkSync(record);
            this.syncDirectory(this.wal);
            report.retiredSegments++;
        });
    }
    async run(options: MaintenanceOptions): Promise<MaintenanceReport> { if (this.busy)
        throw Error('Maintenance already running'); this.busy = true; try {
        return await this.runOwned(options);
    }
    finally {
        this.busy = false;
    } }
    private async runOwned(options: MaintenanceOptions): Promise<MaintenanceReport> {
        this.o = options;
        this.work = 0;
        for (const [key, value, min, max] of [['segments', options.maxSegments ?? 2, 1, 16], ['segmentBytes', options.maxSegmentBytes ?? 16 * 1024 * 1024, 1024, 64 * 1024 * 1024], ['workBytes', options.maxWorkBytes ?? 128 * 1024 * 1024, 1024, 512 * 1024 * 1024], ['frames', options.maxFrames ?? 2048, 1, 10000], ['temporary', options.maxTemporaryFiles ?? 8, 1, 64]] as const) {
            if (!Number.isSafeInteger(value) || value < min || value > max)
                throw Error('Invalid maintenance bound');
            this.limits[key] = value;
        }
        if (!Number.isSafeInteger(options.minAgeMs ?? 86400000) || (options.minAgeMs ?? 86400000) < 0)
            throw Error('Invalid retention minimum');
        const parent = path.resolve(options.allowedParent), store = path.resolve(options.store);
        this.directory(parent);
        if (!store.startsWith(parent + path.sep) || path.dirname(store) !== parent)
            throw Error('Store must be a direct owned child of allowed parent');
        this.directory(store);
        const ownership = JSON.parse(this.read(path.join(store, 'ownership.json'), 4096).toString());
        if (!uuid.test(options.ownerId) || !uuid.test(options.clusterId) || ownership.id !== options.ownerId || ownership.clusterId !== options.clusterId)
            throw Error('Unowned disposable storage root');
        for (const name of this.entries(store, 32))
            if (!['ownership.json', 'wal', 'archive', 'derived-parquet'].includes(name))
                throw Error('Unknown storage-root artifact retained');
        this.wal = path.join(store, 'wal');
        this.archive = path.join(store, 'archive');
        this.directory(this.wal);
        this.directory(this.archive);
        const marker = JSON.parse(this.read(path.join(this.wal, 'quota-journal.json'), 4096).toString());
        if (!uuid.test(marker.id))
            throw Error('Missing metered journal identity');
        this.journalId = marker.id;
        const journal = (await this.db.query('SELECT path_hash FROM quota_journals WHERE id=$1', [this.journalId])).rows;
        const fingerprint = hash(process.platform === 'win32' ? this.wal.toLowerCase() : this.wal);
        if (journal.length !== 1 || journal[0].path_hash !== fingerprint)
            throw Error('Journal registry/path mismatch');
        const entries = this.entries(this.wal);
        for (const name of entries)
            if (!['active.wal', '.journal.owner', 'quota-journal.json', RETENTION_SEQUENCE, RETENTION_SEQUENCE + '.new'].includes(name) && !segment.test(name) && !/^retirement-[a-f0-9-]{36}\.json$/.test(name) && !/^retired-[a-f0-9-]{36}\.wal$/.test(name))
                throw Error('Unknown journal artifact retained');
        for (const name of entries)
            this.regular(path.join(this.wal, name));
        const lock = path.join(this.wal, '.journal.owner');
        if (fs.existsSync(lock)) {
            const m = parseLockContent(this.read(lock, 4096).toString());
            if (!m || m.hostname !== os.hostname() || !m.lockId)
                throw Error('Uncertain journal owner retained');
        }
        const owner = new JournalOwnershipManager(this.wal);
        owner.acquireOwnership();
        const report: MaintenanceReport = { dryRun: !options.apply, retiredSegments: 0, reclaimedWalBytes: 0, reclaimedTemporaryBytes: 0, temporaryFilesRemoved: 0, resumed: 0, eligible: [], retained: [], directoryFsync: process.platform === 'win32' ? 'not-supported-on-windows' : 'supported', ledgerPolicy: 'Permanent COMMITTED identities retained unchanged; RESERVED identities never age-refunded; historical ledger size remains unbounded' };
        try {
            const pendingWatermark = path.join(this.wal, RETENTION_SEQUENCE + '.new');
            if (fs.existsSync(pendingWatermark)) {
                const staged = JSON.parse(this.read(pendingWatermark, 1024).toString()), target = path.join(this.wal, RETENTION_SEQUENCE);
                if (staged.version !== 1 || !Number.isSafeInteger(staged.nextIndex) || staged.nextIndex < 0 || staged.nextIndex > 10000000000)
                    throw Error('Uncertain staged watermark retained');
                if (fs.existsSync(target)) {
                    const old = JSON.parse(this.read(target, 1024).toString());
                    if (old.version !== 1 || !Number.isSafeInteger(old.nextIndex) || staged.nextIndex < old.nextIndex)
                        throw Error('Watermark order mismatch retained');
                }
                if (options.apply) {
                    fs.renameSync(pendingWatermark, target);
                    this.syncDirectory(this.wal);
                }
                else
                    report.retained.push({ segment: RETENTION_SEQUENCE + '.new', reason: 'Staged watermark requires explicit apply recovery' });
            }
            let recordCount = 0;
            const preparedSegments = new Set<string>();
            const records = entries.filter(n => /^retirement-/.test(n)), knownRetired = new Set<string>(records.map(n => 'retired-' + n.slice(11, -5) + '.wal'));
            for (const name of records) {
                if (recordCount >= this.limits.segments)
                    break;
                recordCount++;
                this.check();
                const record = path.join(this.wal, name), wrapper = JSON.parse(this.read(record, 8 * 1024 * 1024).toString()), p = wrapper.proof as Retirement;
                if (wrapper.sha !== hash(JSON.stringify(p)) || p.version !== 1 || p.id !== name.slice(11, -5) || !uuid.test(p.id) || !segment.test(p.segment) || p.retired !== 'retired-' + p.id + '.wal' || p.journalId !== this.journalId || p.ownerId !== options.ownerId || !Array.isArray(p.frames) || !p.frames.length || p.frames.length > this.limits.frames || p.bytes > this.limits.segmentBytes)
                    throw Error('Invalid retirement evidence retained');
                knownRetired.add(p.retired);
                preparedSegments.add(p.segment);
                if (options.apply) {
                    await this.finish(p, record, report);
                    report.resumed++;
                }
                else
                    report.retained.push({ segment: p.segment, reason: 'Prepared retirement requires explicit recovery/apply' });
            }
            for (const name of entries.filter(n => /^retired-/.test(n)))
                if (!knownRetired.has(name))
                    throw Error('Orphan retirement evidence retained');
            let inspectedSegments=recordCount;
            for (const name of entries.filter(n => segment.test(n) && !preparedSegments.has(n))) {
                if (inspectedSegments >= this.limits.segments)
                    break;
                inspectedSegments++;
                this.check();
                try {
                    await this.verifyConsumerReferences();
                    const file = path.join(this.wal, name), stat = this.regular(file, this.limits.segmentBytes);
                    if (Date.now() - stat.mtimeMs < (options.minAgeMs ?? 86400000))
                        throw Error('Segment younger than retention minimum');
                    const bytes = this.read(file, this.limits.segmentBytes), frames: FrameProof[] = [];
                    let offset = 0;
                    while (offset < bytes.length) {
                        const result = deserializeWalFrame(bytes.subarray(offset), offset);
                        if (!result.valid || !result.frame || result.bytesConsumed <= 0)
                            throw Error('Invalid/incomplete closed segment retained');
                        if (frames.length >= this.limits.frames)
                            throw Error('Frame count bound');
                        frames.push(await this.frameProof(result.frame));
                        offset += result.bytesConsumed;
                    }
                    if (!frames.length)
                        throw Error('Empty sealed segment retained');
                    for (const p of frames)
                        await this.verifyProof(p);
                    await this.cleanTemporary(frames, report);
                    report.eligible.push({ segment: name, bytes: bytes.length });
                    if (!options.apply)
                        continue;
                    await this.fault('before-prepare');
                    this.watermark(name);
                    const id = crypto.randomUUID(), p: Retirement = { version: 1, id, journalId: this.journalId, ownerId: options.ownerId, segment: name, retired: 'retired-' + id + '.wal', sha: hash(bytes), bytes: bytes.length, frames };
                    const record = path.join(this.wal, 'retirement-' + id + '.json');
                    this.durable(record, this.encode(p));
                    await this.fault('after-prepare');
                    await this.finish(p, record, report);
                }
                catch (error) {
                    if (options.signal?.aborted)
                        throw error;
                    report.retained.push({ segment: name, reason: error instanceof Error ? error.message : 'Uncertain evidence retained' });
                    if (this.work >= this.limits.workBytes)
                        break;
                }
            }
            report.retained.push({ segment: 'active.wal', reason: 'Active append segment is never eligible' });
            return report;
        }
        finally {
            owner.releaseOwnership();
        }
    }
}
