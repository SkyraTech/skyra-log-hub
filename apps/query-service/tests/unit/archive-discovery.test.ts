import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { ArchiveDiscoveryService } from '../../src/modules/archive-discovery/application/archive-discovery.service.js';
import { InMemoryArchiveSegmentRepository } from '../../src/modules/archive-discovery/infrastructure/in-memory-archive-segment.repository.js';
import { ManifestVerifierService } from '../../src/modules/archive-discovery/application/manifest-verifier.service.js';
import { PathSafetyService } from '../../src/modules/archive-discovery/infrastructure/path-safety.service.js';
import { ProjectAuthorizationService } from '../../src/modules/auth/authorization/project-authorization.service.js';
import { QueryConfigService } from '../../src/config/query-config.service.js';
import { QueryAuditService } from '../../src/modules/audit/query-audit.service.js';
import type { QueryPrincipal } from '../../src/modules/auth/domain/principal.model.js';
import {
  InvalidArgumentException,
  TimeRangeExceededException,
} from '../../src/common/errors/query.errors.js';

describe('ArchiveDiscoveryService Unit Tests (LOGHUB-QUERY-002)', () => {
  const config = new QueryConfigService({
    nodeEnv: 'test',
    archiveRoot: process.cwd(),
    maxTimeRangeDays: 30,
    maxSegmentsPerQuery: 10,
  });

  const repo = new InMemoryArchiveSegmentRepository();
  const authService = new ProjectAuthorizationService();
  const pathSafety = new PathSafetyService(config);
  const manifestVerifier = new ManifestVerifierService();
  const audit = new QueryAuditService(config);

  const discoveryService = new ArchiveDiscoveryService(
    repo,
    authService,
    pathSafety,
    manifestVerifier,
    config,
    audit,
  );

  const testPrincipal: QueryPrincipal = {
    sub: 'test-user',
    tenantId: 'tenant-100',
    authorizedProjects: ['auth', 'billing'],
    allowedEnvironments: ['production'],
    roles: ['analyst'],
    iss: 'https://auth.skyra.internal',
    aud: 'skyra-loghub-query',
    exp: Math.floor(Date.now() / 1000) + 3600,
  };

  it('should discover matching segments for authorized projects in time window', async () => {
    await repo.saveSegment({
      id: 'seg-1',
      tenantId: 'tenant-100',
      projectId: 'auth',
      environment: 'production',
      serviceName: 'auth-api',
      date: '2026-10-25',
      segmentFilename: 'segment_0001.jsonl',
      recordCount: 1500,
      byteSize: 102400,
      sha256Checksum: 'dummyhash1',
      firstEventTimestamp: new Date('2026-10-25T10:00:00Z'),
      lastEventTimestamp: new Date('2026-10-25T11:00:00Z'),
      finalizedAt: new Date('2026-10-25T11:05:00Z'),
      writerInstanceId: 'inst-1',
      journalSegmentId: 'j-1',
      journalStartOffset: 0,
      journalEndOffset: 102400,
    });

    await repo.saveSegment({
      id: 'seg-2',
      tenantId: 'tenant-100',
      projectId: 'billing',
      environment: 'production',
      serviceName: 'billing-worker',
      date: '2026-10-25',
      segmentFilename: 'segment_0002.jsonl',
      recordCount: 3000,
      byteSize: 204800,
      sha256Checksum: 'dummyhash2',
      firstEventTimestamp: new Date('2026-10-25T11:00:00Z'),
      lastEventTimestamp: new Date('2026-10-25T12:00:00Z'),
      finalizedAt: new Date('2026-10-25T12:05:00Z'),
      writerInstanceId: 'inst-1',
      journalSegmentId: 'j-2',
      journalStartOffset: 0,
      journalEndOffset: 204800,
    });

    const result = await discoveryService.discoverSegments(testPrincipal, {
      startTime: new Date('2026-10-25T00:00:00Z'),
      endTime: new Date('2026-10-25T23:59:59Z'),
      projects: ['auth', 'billing'],
    });

    assert.equal(result.totalDiscovered, 2);
    assert.deepEqual(result.authorizedProjects.slice().sort(), ['auth', 'billing'].sort());
    assert.deepEqual(result.segments.map((s) => s.id).sort(), ['seg-1', 'seg-2'].sort());
  });

  it('should filter segments by specific project if requested', async () => {
    const result = await discoveryService.discoverSegments(testPrincipal, {
      startTime: new Date('2026-10-25T00:00:00Z'),
      endTime: new Date('2026-10-25T23:59:59Z'),
      projects: ['billing'],
    });

    assert.equal(result.totalDiscovered, 1);
    assert.equal(result.segments[0]?.projectId, 'billing');
    assert.equal(result.segments[0]?.id, 'seg-2');
  });

  it('should reject requests where startTime >= endTime', async () => {
    await assert.rejects(
      () =>
        discoveryService.discoverSegments(testPrincipal, {
          startTime: new Date('2026-10-25T12:00:00Z'),
          endTime: new Date('2026-10-25T10:00:00Z'),
          projects: ['auth'],
        }),
      (err: unknown) => {
        assert.ok(err instanceof InvalidArgumentException);
        return true;
      },
    );
  });

  it('should reject requests exceeding maximum time range ceiling', async () => {
    await assert.rejects(
      () =>
        discoveryService.discoverSegments(testPrincipal, {
          startTime: new Date('2026-01-01T00:00:00Z'),
          endTime: new Date('2026-03-01T00:00:00Z'), // ~59 days > 30 days limit
          projects: ['auth'],
        }),
      (err: unknown) => {
        assert.ok(err instanceof TimeRangeExceededException);
        return true;
      },
    );
  });
});
