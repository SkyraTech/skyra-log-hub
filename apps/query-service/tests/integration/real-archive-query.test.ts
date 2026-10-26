import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { ArchiveDiscoveryService } from '../../src/modules/archive-discovery/application/archive-discovery.service.js';
import { ManifestVerifierService } from '../../src/modules/archive-discovery/application/manifest-verifier.service.js';
import { PathSafetyService } from '../../src/modules/archive-discovery/infrastructure/path-safety.service.js';
import { ProjectAuthorizationService } from '../../src/modules/auth/authorization/project-authorization.service.js';
import { InMemoryArchiveSegmentRepository } from '../../src/modules/archive-discovery/infrastructure/in-memory-archive-segment.repository.js';
import { QueryConfigService } from '../../src/config/query-config.service.js';
import { QueryAuditService } from '../../src/modules/audit/query-audit.service.js';
import { FilterCompilerService } from '../../src/modules/query-execution/application/filter-compiler.service.js';
import { SqlGeneratorService } from '../../src/modules/query-execution/application/sql-generator.service.js';
import { QueryPlannerService } from '../../src/modules/query-execution/application/query-planner.service.js';
import { DuckDbInstanceManager } from '../../src/modules/query-execution/infrastructure/duckdb/duckdb-instance.manager.js';
import { QueryResourceGovernorService } from '../../src/modules/query-execution/infrastructure/duckdb/query-resource-governor.service.js';
import { DuckDbLogQueryAdapter } from '../../src/modules/query-execution/infrastructure/duckdb/duckdb-query-adapter.js';
import type { QueryPrincipal } from '../../src/modules/auth/domain/principal.model.js';
import type { ArchiveSegmentRecord } from '../../src/modules/archive-discovery/domain/archive-segment.repository.interface.js';

describe('Real Archive Layout End-to-End Query Integration (LOGHUB-QUERY-003)', () => {
  let archiveRoot: string;
  let planner: QueryPlannerService;
  let adapter: DuckDbLogQueryAdapter;
  let instanceManager: DuckDbInstanceManager;

  const tenantId = '00000000-0000-0000-0000-000000000001';
  const authorizedPrincipal: QueryPrincipal = {
    sub: 'eng-lead-01',
    tenantId,
    authorizedProjects: ['auth-service', 'billing-service'],
    allowedEnvironments: ['production', 'staging'],
    roles: ['analyst'],
    iss: 'https://auth.skyra.internal',
    aud: 'skyra-loghub-query',
    exp: Math.floor(Date.now() / 1000) + 3600,
  };

  before(async () => {
    archiveRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skyra-real-archive-test-'));

    // Create realistic Phase 2 canonical folder structure:
    // {tenant}/{project}/{environment}/{service}/{date}/
    const authDir = path.join(archiveRoot, tenantId, 'auth-service', 'production', 'auth-service', '2026-10-26');
    const billingDir = path.join(archiveRoot, tenantId, 'billing-service', 'production', 'billing-service', '2026-10-26');
    fs.mkdirSync(authDir, { recursive: true });
    fs.mkdirSync(billingDir, { recursive: true });

    const authFile = path.join(authDir, 'segment-0000.jsonl');
    const authEvents = [
      {
        '@timestamp': '2026-10-26T08:00:00.000Z',
        'ecs.version': '8.11.0',
        event: { id: '11111111-1111-4111-8111-111111111111', action: 'auth.login.success' },
        log: { level: 'info' },
        message: 'User authenticated successfully',
        service: { name: 'auth-service', environment: 'production' },
        skyra: { project_id: 'auth-service', tenant_id: tenantId, schema_version: '1.0.0' },
        user: { id: 'usr-42', email: 'alice@skyra.internal' },
      },
      {
        '@timestamp': '2026-10-26T08:30:00.000Z',
        'ecs.version': '8.11.0',
        event: { id: '22222222-2222-4222-8222-222222222222', action: 'auth.login.failed' },
        log: { level: 'warn' },
        message: 'Invalid password attempt',
        service: { name: 'auth-service', environment: 'production' },
        skyra: { project_id: 'auth-service', tenant_id: tenantId, schema_version: '1.0.0' },
        user: { id: 'usr-99', email: 'mallory@badactor.net' },
      },
    ];

    const authBytes = Buffer.from(authEvents.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf8');
    fs.writeFileSync(authFile, authBytes);
    const authSha = crypto.createHash('sha256').update(authBytes).digest('hex');

    // Create manifest.json for auth
    const authManifest = {
      manifest_version: '1.0.0',
      tenant_id: tenantId,
      project_id: 'auth-service',
      environment: 'production',
      service_name: 'auth-service',
      date: '2026-10-26',
      finalized_at: '2026-10-26T09:00:00.000Z',
      segments: [
        {
          filename: 'segment-0000.jsonl',
          byte_size: authBytes.length,
          sha256: authSha,
          record_count: 2,
        },
      ],
    };
    fs.writeFileSync(path.join(authDir, 'manifest.json'), JSON.stringify(authManifest, null, 2));

    const billingFile = path.join(billingDir, 'segment-0000.jsonl');
    const billingEvents = [
      {
        '@timestamp': '2026-10-26T08:15:00.000Z',
        'ecs.version': '8.11.0',
        event: { id: '33333333-3333-4333-8333-333333333333', action: 'billing.invoice.generated' },
        log: { level: 'info' },
        message: 'Monthly subscription invoice generated: $299.00',
        service: { name: 'billing-service', environment: 'production' },
        skyra: { project_id: 'billing-service', tenant_id: tenantId, schema_version: '1.0.0' },
      },
    ];
    const billingBytes = Buffer.from(billingEvents.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf8');
    fs.writeFileSync(billingFile, billingBytes);
    const billingSha = crypto.createHash('sha256').update(billingBytes).digest('hex');

    const billingManifest = {
      manifest_version: '1.0.0',
      tenant_id: tenantId,
      project_id: 'billing-service',
      environment: 'production',
      service_name: 'billing-service',
      date: '2026-10-26',
      finalized_at: '2026-10-26T09:00:00.000Z',
      segments: [
        {
          filename: 'segment-0000.jsonl',
          byte_size: billingBytes.length,
          sha256: billingSha,
          record_count: 1,
        },
      ],
    };
    fs.writeFileSync(path.join(billingDir, 'manifest.json'), JSON.stringify(billingManifest, null, 2));

    // Seed mock metadata repository
    const segmentRepo = new InMemoryArchiveSegmentRepository();
    const authRecord: ArchiveSegmentRecord = {
      id: 'auth-seg-rec-1',
      tenantId,
      projectId: 'auth-service',
      environment: 'production',
      serviceName: 'auth-service',
      date: '2026-10-26',
      segmentFilename: 'segment-0000.jsonl',
      recordCount: 2,
      byteSize: authBytes.length,
      sha256Checksum: authSha,
      firstEventTimestamp: new Date('2026-10-26T08:00:00.000Z'),
      lastEventTimestamp: new Date('2026-10-26T08:30:00.000Z'),
      finalizedAt: new Date('2026-10-26T09:00:00.000Z'),
      writerInstanceId: 'writer-node-01',
      journalSegmentId: 'journal-01',
      journalStartOffset: 0,
      journalEndOffset: authBytes.length,
    };
    const billingRecord: ArchiveSegmentRecord = {
      id: 'billing-seg-rec-1',
      tenantId,
      projectId: 'billing-service',
      environment: 'production',
      serviceName: 'billing-service',
      date: '2026-10-26',
      segmentFilename: 'segment-0000.jsonl',
      recordCount: 1,
      byteSize: billingBytes.length,
      sha256Checksum: billingSha,
      firstEventTimestamp: new Date('2026-10-26T08:15:00.000Z'),
      lastEventTimestamp: new Date('2026-10-26T08:15:00.000Z'),
      finalizedAt: new Date('2026-10-26T09:00:00.000Z'),
      writerInstanceId: 'writer-node-01',
      journalSegmentId: 'journal-02',
      journalStartOffset: 0,
      journalEndOffset: billingBytes.length,
    };
    await segmentRepo.saveSegment(authRecord);
    await segmentRepo.saveSegment(billingRecord);

    const config = new QueryConfigService({
      nodeEnv: 'test',
      archiveRoot,
      maxTimeRangeDays: 30,
      maxSegmentsPerQuery: 500,
    });
    const audit = new QueryAuditService(config);
    const authService = new ProjectAuthorizationService();
    const pathSafety = new PathSafetyService(config);
    const manifestVerifier = new ManifestVerifierService();
    const discovery = new ArchiveDiscoveryService(
      segmentRepo,
      authService,
      pathSafety,
      manifestVerifier,
      config,
      audit,
    );

    const filterCompiler = new FilterCompilerService();
    planner = new QueryPlannerService(discovery, authService, filterCompiler, config, audit);

    instanceManager = new DuckDbInstanceManager(config);
    await instanceManager.initialize();

    const sqlGenerator = new SqlGeneratorService();
    const governor = new QueryResourceGovernorService();
    adapter = new DuckDbLogQueryAdapter(instanceManager, sqlGenerator, governor, audit);
  });

  after(async () => {
    if (instanceManager) {
      await instanceManager.shutdown();
    }
    if (archiveRoot && fs.existsSync(archiveRoot)) {
      fs.rmSync(archiveRoot, { recursive: true, force: true });
    }
  });

  it('RAQ-1: should discover, verify, plan, and execute real query across multiple authorized project archives', async () => {
    const plan = await planner.planQuery(authorizedPrincipal, {
      time_range: {
        start: '2026-10-26T00:00:00.000Z',
        end: '2026-10-26T12:00:00.000Z',
      },
      sort: { field: '@timestamp', direction: 'desc' },
      limit: 50,
    });

    assert.equal(plan.descriptors.length, 2);
    assert.equal(plan.descriptors.every((d) => d.integrityStatus === 'VERIFIED'), true);

    const result = await adapter.execute(plan);

    assert.equal(result.events.length, 3);
    assert.equal(result.scannedSegmentCount, 2);
    // Ordered descending: 08:30 (auth), 08:15 (billing), 08:00 (auth)
    assert.equal(result.events[0]?.['@timestamp'], '2026-10-26T08:30:00.000Z');
    assert.equal(result.events[0]?.service.name, 'auth-service');
    assert.equal(result.events[1]?.['@timestamp'], '2026-10-26T08:15:00.000Z');
    assert.equal(result.events[1]?.service.name, 'billing-service');
    assert.equal(result.events[2]?.['@timestamp'], '2026-10-26T08:00:00.000Z');
    assert.equal(result.events[2]?.service.name, 'auth-service');
  });

  it('RAQ-2: should filter by project scope and return only matching project events', async () => {
    const plan = await planner.planQuery(authorizedPrincipal, {
      time_range: {
        start: '2026-10-26T00:00:00.000Z',
        end: '2026-10-26T12:00:00.000Z',
      },
      projects: ['billing-service'],
      limit: 50,
    });

    assert.equal(plan.descriptors.length, 1);
    assert.equal(plan.descriptors[0]?.projectId, 'billing-service');

    const result = await adapter.execute(plan);
    assert.equal(result.events.length, 1);
    assert.equal(result.events[0]?.service.name, 'billing-service');
    assert.ok(result.events[0]?.message.includes('invoice generated'));
  });

  it('RAQ-3: should filter by structured predicates on canonical events', async () => {
    const plan = await planner.planQuery(authorizedPrincipal, {
      time_range: {
        start: '2026-10-26T00:00:00.000Z',
        end: '2026-10-26T12:00:00.000Z',
      },
      levels: ['warn'],
      query_text: 'Invalid password',
    });

    const result = await adapter.execute(plan);
    assert.equal(result.events.length, 1);
    assert.equal(result.events[0]?.log.level, 'warn');
    assert.equal(result.events[0]?.event.action, 'auth.login.failed');
  });

  it('RAQ-4: should ensure underlying archive segments remain strictly immutable and read-only', async () => {
    const authFile = path.join(archiveRoot, tenantId, 'auth-service', 'production', 'auth-service', '2026-10-26', 'segment-0000.jsonl');
    const beforeStats = fs.statSync(authFile);

    // Execute multiple intensive analytical queries
    await planner.planQuery(authorizedPrincipal, {
      time_range: {
        start: '2026-10-26T00:00:00.000Z',
        end: '2026-10-26T12:00:00.000Z',
      },
      limit: 100,
    }).then((p) => adapter.execute(p));

    const afterStats = fs.statSync(authFile);
    assert.equal(afterStats.size, beforeStats.size, 'Archive file size must not change');
    assert.equal(afterStats.mtimeMs, beforeStats.mtimeMs, 'Archive file modified timestamp must not change');
  });
});
