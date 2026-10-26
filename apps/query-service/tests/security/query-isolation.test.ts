import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { DuckDbInstanceManager } from '../../src/modules/query-execution/infrastructure/duckdb/duckdb-instance.manager.js';
import { SqlGeneratorService } from '../../src/modules/query-execution/application/sql-generator.service.js';
import { QueryResourceGovernorService } from '../../src/modules/query-execution/infrastructure/duckdb/query-resource-governor.service.js';
import { DuckDbLogQueryAdapter } from '../../src/modules/query-execution/infrastructure/duckdb/duckdb-query-adapter.js';
import { FilterCompilerService } from '../../src/modules/query-execution/application/filter-compiler.service.js';
import { QueryConfigService } from '../../src/config/query-config.service.js';
import { QueryAuditService } from '../../src/modules/audit/query-audit.service.js';
import type { AuthorizedLogQueryPlan } from '../../src/modules/query-execution/domain/authorized-query-plan.model.js';
import type { TrustedArchiveSegmentDescriptor } from '../../src/modules/archive-discovery/domain/archive-segment-descriptor.model.js';
import {
  QueryBudgetExceededException,
  TimeRangeExceededException,
  ForbiddenProjectException,
  CrossTenantViolationException,
} from '../../src/common/errors/query.errors.js';
import { ProjectAuthorizationService } from '../../src/modules/auth/authorization/project-authorization.service.js';
import { QueryPlannerService } from '../../src/modules/query-execution/application/query-planner.service.js';
import { ArchiveDiscoveryService } from '../../src/modules/archive-discovery/application/archive-discovery.service.js';
import { InMemoryArchiveSegmentRepository } from '../../src/modules/archive-discovery/infrastructure/in-memory-archive-segment.repository.js';
import { PathSafetyService } from '../../src/modules/archive-discovery/infrastructure/path-safety.service.js';
import { ManifestVerifierService } from '../../src/modules/archive-discovery/application/manifest-verifier.service.js';

describe('Query Security & Tenant Isolation Tests (LOGHUB-QUERY-003 / P0)', () => {
  let tempDir: string;
  let tenantAFile: string;
  let tenantBFile: string;
  let instanceManager: DuckDbInstanceManager;
  let adapter: DuckDbLogQueryAdapter;
  let filterCompiler: FilterCompilerService;
  let sqlGenerator: SqlGeneratorService;

  const tenantA = '00000000-0000-0000-0000-000000000001';
  const tenantB = '00000000-0000-0000-0000-000000000002';

  before(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyra-isolation-test-'));
    tenantAFile = path.join(tempDir, 'tenant-a-segment.jsonl');
    tenantBFile = path.join(tempDir, 'tenant-b-segment.jsonl');

    // Identical service name, identical event ID, identical timestamps, different tenants
    const sharedEventId = '99999999-9999-4999-8999-999999999999';
    const timestamp = '2026-10-26T14:00:00.000Z';

    const eventsTenantA = [
      {
        '@timestamp': timestamp,
        'ecs.version': '8.11.0',
        event: { id: sharedEventId, action: 'document.access' },
        log: { level: 'info' },
        message: 'Tenant A Confidential Financial Record',
        service: { name: 'core-api', environment: 'production' },
        skyra: { project_id: 'finance', tenant_id: tenantA, schema_version: '1.0.0' },
      },
      {
        '@timestamp': '2026-10-26T14:05:00.000Z',
        'ecs.version': '8.11.0',
        event: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', action: 'document.access' },
        log: { level: 'info' },
        message: 'Normal query log item for Tenant A',
        service: { name: 'core-api', environment: 'production' },
        skyra: { project_id: 'finance', tenant_id: tenantA, schema_version: '1.0.0' },
      },
    ];

    const eventsTenantB = [
      {
        '@timestamp': timestamp,
        'ecs.version': '8.11.0',
        event: { id: sharedEventId, action: 'document.access' },
        log: { level: 'info' },
        message: 'Tenant B Top Secret Healthcare Record',
        service: { name: 'core-api', environment: 'production' },
        skyra: { project_id: 'finance', tenant_id: tenantB, schema_version: '1.0.0' },
      },
    ];

    fs.writeFileSync(tenantAFile, eventsTenantA.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf8');
    fs.writeFileSync(tenantBFile, eventsTenantB.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf8');

    const config = new QueryConfigService();
    instanceManager = new DuckDbInstanceManager(config);
    await instanceManager.initialize();

    sqlGenerator = new SqlGeneratorService();
    const governor = new QueryResourceGovernorService();
    const audit = new QueryAuditService(config);
    adapter = new DuckDbLogQueryAdapter(instanceManager, sqlGenerator, governor, audit);
    filterCompiler = new FilterCompilerService();
  });

  after(async () => {
    if (instanceManager) {
      await instanceManager.shutdown();
    }
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  const makeDescriptor = (
    filePath: string,
    id: string,
    tId: string,
    pId: string,
  ): TrustedArchiveSegmentDescriptor => {
    const stats = fs.statSync(filePath);
    return {
      id,
      tenantId: tId,
      projectId: pId,
      environment: 'production',
      serviceName: 'core-api',
      date: '2026-10-26',
      segmentFilename: path.basename(filePath),
      resolvedPath: filePath,
      recordCount: 2,
      byteSize: stats.size,
      sha256Checksum: crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex'),
      firstEventTimestamp: '2026-10-26T14:00:00.000Z',
      lastEventTimestamp: '2026-10-26T14:05:00.000Z',
      finalizedAt: '2026-10-26T14:10:00.000Z',
      verifiedAt: '2026-10-26T14:15:00.000Z',
      integrityStatus: 'VERIFIED',
    };
  };

  it('SEC-1: SQL injection in message filter must be treated as literal text and not alter query semantics', async () => {
    const descA = makeDescriptor(tenantAFile, 'seg-a', tenantA, 'finance');

    const sqlInjectionPayloads = [
      "' OR '1'='1",
      "'; DROP TABLE events; --",
      "' UNION SELECT 1, 2, 'injected' --",
      "\\'; DROP TABLE events; --",
      "\" OR 1=1 --",
    ];

    for (const payload of sqlInjectionPayloads) {
      const filter = filterCompiler.compileFilters([
        { field: 'message', operator: 'contains', value: payload },
      ]);

      const plan: AuthorizedLogQueryPlan = {
        queryId: 'sec-sqli-test',
        tenantId: tenantA,
        authorizedProjects: ['finance'],
        descriptors: [descA],
        timeInterval: {
          startInclusive: '2026-10-26T14:00:00.000Z',
          endExclusive: '2026-10-26T15:00:00.000Z',
        },
        filter,
        sort: { field: '@timestamp', direction: 'desc' },
        limit: 10,
        resourceBudget: {
          maxSegments: 500,
          maxScannedBytes: 5000000,
          maxRows: 500,
          timeoutMs: 30000,
          memoryBudgetMb: 256,
        },
      };

      const result = await adapter.execute(plan);
      // Payload does not match any actual message, must safely return 0 results without SQL syntax or execution error
      assert.equal(result.events.length, 0, `Payload "${payload}" should return 0 rows`);
    }
  });

  it('SEC-2: Tenant A query must NEVER return Tenant B events even when descriptors from Tenant B are maliciously injected', async () => {
    // Maliciously inject Tenant B's segment descriptor into Tenant A's query plan
    const descA = makeDescriptor(tenantAFile, 'seg-a', tenantA, 'finance');
    const descB = makeDescriptor(tenantBFile, 'seg-b', tenantB, 'finance');

    const plan: AuthorizedLogQueryPlan = {
      queryId: 'sec-tenant-isolation',
      tenantId: tenantA, // Query executed under Tenant A authorization
      authorizedProjects: ['finance'],
      descriptors: [descA, descB], // Injected rogue descriptor from Tenant B
      timeInterval: {
        startInclusive: '2026-10-26T14:00:00.000Z',
        endExclusive: '2026-10-26T15:00:00.000Z',
      },
      sort: { field: '@timestamp', direction: 'desc' },
      limit: 10,
      resourceBudget: {
        maxSegments: 500,
        maxScannedBytes: 5000000,
        maxRows: 500,
        timeoutMs: 30000,
        memoryBudgetMb: 256,
      },
    };

    const result = await adapter.execute(plan);

    // Verify all returned events belong strictly to Tenant A
    assert.equal(result.events.length, 2);
    for (const event of result.events) {
      assert.equal(event.skyra.tenant_id, tenantA);
      assert.notEqual(event.message, 'Tenant B Top Secret Healthcare Record');
    }
  });

  it('SEC-3: Cross-project descriptor injection is blocked by project-level row containment', async () => {
    const descA = makeDescriptor(tenantAFile, 'seg-a', tenantA, 'finance');

    const plan: AuthorizedLogQueryPlan = {
      queryId: 'sec-project-isolation',
      tenantId: tenantA,
      authorizedProjects: ['public-marketing'], // Principal only authorized for marketing
      descriptors: [descA], // Segment contains 'finance' project logs
      timeInterval: {
        startInclusive: '2026-10-26T14:00:00.000Z',
        endExclusive: '2026-10-26T15:00:00.000Z',
      },
      sort: { field: '@timestamp', direction: 'desc' },
      limit: 10,
      resourceBudget: {
        maxSegments: 500,
        maxScannedBytes: 5000000,
        maxRows: 500,
        timeoutMs: 30000,
        memoryBudgetMb: 256,
      },
    };

    const result = await adapter.execute(plan);
    // Since row contains project_id = 'finance', it is filtered out
    assert.equal(result.events.length, 0);
  });

  it('SEC-4: Query planner rejects unauthorized project requests fail-closed', async () => {
    const authService = new ProjectAuthorizationService();
    const segmentRepo = new InMemoryArchiveSegmentRepository();
    const config = new QueryConfigService();
    const audit = new QueryAuditService(config);
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
    const planner = new QueryPlannerService(discovery, authService, filterCompiler, config, audit);

    const principal = {
      sub: 'restricted-user',
      tenantId: tenantA,
      authorizedProjects: ['orders'],
      allowedEnvironments: ['production'],
      roles: ['viewer' as const],
      iss: 'https://auth.skyra.internal',
      aud: 'skyra-loghub-query',
      exp: Math.floor(Date.now() / 1000) + 3600,
    };

    await assert.rejects(
      async () => {
        await planner.planQuery(principal, {
          time_range: {
            start: '2026-10-26T00:00:00.000Z',
            end: '2026-10-26T01:00:00.000Z',
          },
          projects: ['finance-confidential'], // Not permitted
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof ForbiddenProjectException);
        return true;
      },
    );
  });

  it('SEC-5: DuckDB runtime restricts untrusted extension installation', async () => {
    const conn = await instanceManager.createConnection();
    try {
      await assert.rejects(
        async () => {
          await conn.run('INSTALL non_existent_arbitrary_extension;');
        },
        (err: unknown) => {
          assert.ok(err instanceof Error);
          return true;
        },
      );
    } finally {
      conn.closeSync();
    }
  });

  it('SEC-6: Query planner rejects oversized time intervals > 30 days', async () => {
    const authService = new ProjectAuthorizationService();
    const segmentRepo = new InMemoryArchiveSegmentRepository();
    const config = new QueryConfigService({ maxTimeRangeDays: 30 });
    const audit = new QueryAuditService(config);
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
    const planner = new QueryPlannerService(discovery, authService, filterCompiler, config, audit);

    const principal = {
      sub: 'valid-user',
      tenantId: tenantA,
      authorizedProjects: ['orders'],
      allowedEnvironments: ['production'],
      roles: ['viewer' as const],
      iss: 'https://auth.skyra.internal',
      aud: 'skyra-loghub-query',
      exp: Math.floor(Date.now() / 1000) + 3600,
    };

    await assert.rejects(
      async () => {
        await planner.planQuery(principal, {
          time_range: {
            start: '2026-09-01T00:00:00.000Z',
            end: '2026-10-26T00:00:00.000Z', // 55 days
          },
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof TimeRangeExceededException);
        return true;
      },
    );
  });
});
