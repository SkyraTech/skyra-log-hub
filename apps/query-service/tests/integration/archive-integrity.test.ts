import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { ArchiveDiscoveryService } from '../../src/modules/archive-discovery/application/archive-discovery.service.js';
import { InMemoryArchiveSegmentRepository } from '../../src/modules/archive-discovery/infrastructure/in-memory-archive-segment.repository.js';
import { ManifestVerifierService } from '../../src/modules/archive-discovery/application/manifest-verifier.service.js';
import { PathSafetyService } from '../../src/modules/archive-discovery/infrastructure/path-safety.service.js';
import { ProjectAuthorizationService } from '../../src/modules/auth/authorization/project-authorization.service.js';
import { QueryConfigService } from '../../src/config/query-config.service.js';
import { QueryAuditService } from '../../src/modules/audit/query-audit.service.js';
import type { QueryPrincipal } from '../../src/modules/auth/domain/principal.model.js';

describe('Archive Integrity End-to-End Integration Tests (LOGHUB-QUERY-002)', () => {
  let tempRoot: string;
  let service: ArchiveDiscoveryService;
  let repo: InMemoryArchiveSegmentRepository;

  const tenantId = '00000000-0000-0000-0000-000000000001';
  const projectId = 'skyra-worker';

  const principal: QueryPrincipal = {
    sub: 'auditor-1',
    tenantId,
    authorizedProjects: [projectId],
    allowedEnvironments: ['production'],
    roles: ['analyst'],
    iss: 'https://auth.skyra.internal',
    aud: 'skyra-loghub-query',
    exp: Math.floor(Date.now() / 1000) + 3600,
  };

  before(async () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skyra-archive-integ-'));
    const config = new QueryConfigService({
      nodeEnv: 'test',
      archiveRoot: tempRoot,
    });

    repo = new InMemoryArchiveSegmentRepository();
    const auth = new ProjectAuthorizationService();
    const pathSafety = new PathSafetyService(config);
    const verifier = new ManifestVerifierService();
    const audit = new QueryAuditService(config);

    service = new ArchiveDiscoveryService(repo, auth, pathSafety, verifier, config, audit);

    // Segment 1: Pristine and verified
    const seg1Dir = path.join(tempRoot, tenantId, projectId, 'production', 'worker-service', '2026-10-25');
    fs.mkdirSync(seg1Dir, { recursive: true });
    const seg1File = path.join(seg1Dir, 'segment_0001.jsonl');
    const seg1Content = '{"id":"evt-1","message":"task started"}\n{"id":"evt-2","message":"task done"}\n';
    fs.writeFileSync(seg1File, seg1Content, 'utf8');

    const seg1Checksum = crypto.createHash('sha256').update(seg1Content).digest('hex');
    const seg1Bytes = Buffer.byteLength(seg1Content);

    fs.writeFileSync(
      path.join(seg1Dir, 'segment_0001.manifest.json'),
      JSON.stringify({
        segment_filename: 'segment_0001.jsonl',
        byte_size: seg1Bytes,
        sha256_checksum: seg1Checksum,
        record_count: 2,
      }),
      'utf8',
    );

    await repo.saveSegment({
      id: 'seg-pristine',
      tenantId,
      projectId,
      environment: 'production',
      serviceName: 'worker-service',
      date: '2026-10-25',
      segmentFilename: 'segment_0001.jsonl',
      recordCount: 2,
      byteSize: seg1Bytes,
      sha256Checksum: seg1Checksum,
      firstEventTimestamp: new Date('2026-10-25T10:00:00Z'),
      lastEventTimestamp: new Date('2026-10-25T10:01:00Z'),
      finalizedAt: new Date('2026-10-25T10:05:00Z'),
      writerInstanceId: 'inst-1',
      journalSegmentId: 'j-1',
      journalStartOffset: 0,
      journalEndOffset: seg1Bytes,
    });

    // Segment 2: Corrupted payload
    const seg2File = path.join(seg1Dir, 'segment_0002.jsonl');
    fs.writeFileSync(seg2File, 'tampered-data-not-matching-checksum\n', 'utf8');
    fs.writeFileSync(
      path.join(seg1Dir, 'segment_0002.manifest.json'),
      JSON.stringify({
        segment_filename: 'segment_0002.jsonl',
        byte_size: 100,
        sha256_checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        record_count: 5,
      }),
      'utf8',
    );

    await repo.saveSegment({
      id: 'seg-corrupt',
      tenantId,
      projectId,
      environment: 'production',
      serviceName: 'worker-service',
      date: '2026-10-25',
      segmentFilename: 'segment_0002.jsonl',
      recordCount: 5,
      byteSize: 100,
      sha256Checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      firstEventTimestamp: new Date('2026-10-25T11:00:00Z'),
      lastEventTimestamp: new Date('2026-10-25T11:01:00Z'),
      finalizedAt: new Date('2026-10-25T11:05:00Z'),
      writerInstanceId: 'inst-1',
      journalSegmentId: 'j-2',
      journalStartOffset: 0,
      journalEndOffset: 100,
    });

    // Segment 3: Missing on disk
    await repo.saveSegment({
      id: 'seg-missing',
      tenantId,
      projectId,
      environment: 'production',
      serviceName: 'worker-service',
      date: '2026-10-25',
      segmentFilename: 'segment_0003.jsonl',
      recordCount: 1,
      byteSize: 50,
      sha256Checksum: 'somechecksum',
      firstEventTimestamp: new Date('2026-10-25T12:00:00Z'),
      lastEventTimestamp: new Date('2026-10-25T12:01:00Z'),
      finalizedAt: new Date('2026-10-25T12:05:00Z'),
      writerInstanceId: 'inst-1',
      journalSegmentId: 'j-3',
      journalStartOffset: 0,
      journalEndOffset: 50,
    });
  });

  after(() => {
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('should discover all segments and accurately flag verified, missing, and corrupt items', async () => {
    const result = await service.discoverSegments(principal, {
      projects: [projectId],
      startDate: '2026-10-01',
      endDate: '2026-10-31',
    });

    assert.equal(result.totalDiscovered, 3);
    assert.equal(result.verifiedCount, 1);
    assert.equal(result.corruptCount, 1);
    assert.equal(result.missingCount, 1);

    const pristine = result.segments.find((s) => s.id === 'seg-pristine');
    const corrupt = result.segments.find((s) => s.id === 'seg-corrupt');
    const missing = result.segments.find((s) => s.id === 'seg-missing');

    assert.equal(pristine?.integrityStatus, 'VERIFIED');
    assert.equal(corrupt?.integrityStatus, 'CORRUPT');
    assert.equal(missing?.integrityStatus, 'MISSING');
  });
});
