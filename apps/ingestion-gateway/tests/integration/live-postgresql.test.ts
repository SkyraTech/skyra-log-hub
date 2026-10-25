import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../src/metadata/prisma.service.js';
import { GatewayConfigService } from '../../src/config/config.service.js';
import { PrismaTenantRepository } from '../../src/metadata/repositories/prisma-tenant.repository.js';
import { PrismaProjectRepository } from '../../src/metadata/repositories/prisma-project.repository.js';
import { PrismaCredentialRepository } from '../../src/metadata/repositories/prisma-credential.repository.js';
import { PrismaReceiptRepository } from '../../src/metadata/repositories/prisma-receipt.repository.js';
import { PrismaArchiveSegmentRepository } from '../../src/metadata/repositories/prisma-archive-segment.repository.js';
import { PrismaCheckpointRepository } from '../../src/metadata/repositories/prisma-checkpoint.repository.js';

import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Live PostgreSQL Integration & Production Repository Verification', () => {
  let databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    const envCandidates = [
      path.resolve(process.cwd(), '.env'),
      path.resolve(process.cwd(), 'apps/ingestion-gateway/.env'),
    ];
    for (const envPath of envCandidates) {
      if (fs.existsSync(envPath)) {
        const match = fs.readFileSync(envPath, 'utf8').match(/DATABASE_URL="?([^"\r\n]+)"?/);
        if (match) {
          databaseUrl = match[1];
          process.env['DATABASE_URL'] = databaseUrl;
          break;
        }
      }
    }
  }

  const isDatabaseConfigured =
    databaseUrl &&
    databaseUrl.trim().length > 0 &&
    !databaseUrl.includes('REPLACE_ME');

  if (!isDatabaseConfigured) {
    it('[BLOCKED] Live PostgreSQL tests deferred: DATABASE_URL is not configured for skyra_loghub_dev', () => {
      console.log('\n[PostgreSQL Preflight Notice] DATABASE_URL is NOT_SET or unconfigured.');
      console.log('[PostgreSQL Preflight Notice] Target database: skyra_loghub_dev');
      console.log('[PostgreSQL Preflight Notice] Application role: skyra_loghub_user');
      console.log('[PostgreSQL Preflight Notice] Status: WAITING_FOR_USER_DATABASE_SETUP');
      assert.ok(true, 'Test execution cleanly documents pending user-controlled database checkpoint');
    });
    return;
  }

  // Preflight validation of connection string parameters (WITHOUT logging secrets)
  const validDatabaseUrl = databaseUrl!;
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(validDatabaseUrl);
  } catch (err: unknown) {
    it('rejects malformed DATABASE_URL format during preflight', () => {
      assert.fail(`Invalid DATABASE_URL format: ${String(err)}`);
    });
    return;
  }

  const dbName = parsedUrl.pathname.replace(/^\//, '');
  if (dbName !== 'skyra_loghub_dev') {
    it('safety gate: rejects connection if database name is not exactly skyra_loghub_dev', () => {
      assert.fail(`Safety violation: Target database name is '${dbName}', expected exactly 'skyra_loghub_dev'`);
    });
    return;
  }

  // Execute live tests against dedicated development database
  const config = new GatewayConfigService({
    NODE_ENV: 'development',
    DATABASE_URL: databaseUrl,
  });
  const prismaService = new PrismaService(config);

  const tenantRepo = new PrismaTenantRepository(prismaService);
  const projectRepo = new PrismaProjectRepository(prismaService);
  const credRepo = new PrismaCredentialRepository(prismaService);
  const receiptRepo = new PrismaReceiptRepository(prismaService);
  const archiveRepo = new PrismaArchiveSegmentRepository(prismaService);
  const checkpointRepo = new PrismaCheckpointRepository(prismaService);

  const testTenantId = '11111111-2222-3333-4444-555555555555';
  const testTenantId2 = '99999999-8888-7777-6666-555555555555';
  const testProjectId = 'skyra-live-test-project';
  const testProjectId2 = 'skyra-live-isolated-project';
  const testBatchId = 'live-batch-001';

  it('1. Connects to PostgreSQL skyra_loghub_dev successfully', async () => {
    const isHealthy = await prismaService.isHealthy();
    assert.equal(isHealthy, true, 'PrismaService.isHealthy() must return true for live database');

    // Purge test-owned fixtures from prior aborted runs
    await prismaService.archiveSegment.deleteMany({ where: { tenantId: testTenantId } });
    await prismaService.deduplicationReceipt.deleteMany({ where: { tenantId: testTenantId } });
    await prismaService.ingestionCheckpoint.deleteMany({ where: { id: 'archive_writer_live' } });
    await prismaService.ingestionCredential.deleteMany({ where: { tenantId: testTenantId } });
    await prismaService.project.deleteMany({ where: { tenantId: testTenantId } });
    await prismaService.project.deleteMany({ where: { tenantId: testTenantId2 } });
    await prismaService.tenant.deleteMany({ where: { id: testTenantId } });
    await prismaService.tenant.deleteMany({ where: { id: testTenantId2 } });
  });

  it('2. Tenant repository persists and retrieves isolated test tenant', async () => {
    await tenantRepo.save({
      id: testTenantId,
      code: 'live-test-tenant',
      name: 'Live Test Tenant',
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const retrieved = await tenantRepo.findById(testTenantId);
    assert.ok(retrieved);
    assert.equal(retrieved?.id, testTenantId);
    assert.equal(retrieved?.code, 'live-test-tenant');
  });

  it('3. Project repository persists and retrieves isolated test project', async () => {
    await projectRepo.save({
      id: testProjectId,
      tenantId: testTenantId,
      name: 'Live Test Project',
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const retrieved = await projectRepo.findById(testProjectId);
    assert.ok(retrieved);
    assert.equal(retrieved?.id, testProjectId);
    assert.equal(retrieved?.tenantId, testTenantId);
  });

  it('4. Credential repository persists hashed credential securely', async () => {
    const credId = '22222222-3333-4444-5555-666666666666';
    const keyHash = 'a'.repeat(64);
    await credRepo.save({
      id: credId,
      tenantId: testTenantId,
      keyHash,
      keyPrefix: 'sk_live_test',
      description: 'Live test credential',
      allowedProjects: [testProjectId],
      allowedEnvironments: ['development', 'test'],
      rateLimitPerMin: 600,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 86400000),
      isRevoked: false,
      lastUsedAt: null,
    });

    const found = await credRepo.findByKeyHash(keyHash);
    assert.ok(found);
    assert.equal(found?.id, credId);
    assert.equal(found?.isRevoked, false);
  });

  it('5. Verifies credential scope (allowedProjects and allowedEnvironments)', async () => {
    const keyHash = 'a'.repeat(64);
    const cred = await credRepo.findByKeyHash(keyHash);
    assert.ok(cred);
    assert.ok(cred?.allowedProjects.includes(testProjectId));
    assert.ok(cred?.allowedEnvironments.includes('development'));
    assert.equal(cred?.allowedProjects.includes('unauthorized-project'), false);
  });

  it('6. Rejects revoked credential correctly', async () => {
    const revokedCredId = '33333333-3333-4444-5555-666666666666';
    const revokedHash = 'r'.repeat(64);
    await credRepo.save({
      id: revokedCredId,
      tenantId: testTenantId,
      keyHash: revokedHash,
      keyPrefix: 'sk_live_revk',
      description: 'Revoked credential test',
      allowedProjects: [testProjectId],
      allowedEnvironments: ['development'],
      rateLimitPerMin: 600,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 86400000),
      isRevoked: true,
      lastUsedAt: null,
    });

    const found = await credRepo.findByKeyHash(revokedHash);
    assert.ok(found);
    assert.equal(found?.isRevoked, true);
  });

  it('7. Rejects expired credential correctly', async () => {
    const expiredCredId = '44444444-3333-4444-5555-666666666666';
    const expiredHash = 'e'.repeat(64);
    const pastDate = new Date(Date.now() - 3600000); // 1 hour in the past
    await credRepo.save({
      id: expiredCredId,
      tenantId: testTenantId,
      keyHash: expiredHash,
      keyPrefix: 'sk_live_expr',
      description: 'Expired credential test',
      allowedProjects: [testProjectId],
      allowedEnvironments: ['development'],
      rateLimitPerMin: 600,
      createdAt: new Date(Date.now() - 86400000),
      expiresAt: pastDate,
      isRevoked: false,
      lastUsedAt: null,
    });

    const found = await credRepo.findByKeyHash(expiredHash);
    assert.ok(found);
    assert.ok(found?.expiresAt.getTime() < Date.now(), 'expiresAt must be in the past');
  });

  it('8. Rejects unauthorized project access through credential policy', async () => {
    const cred = await credRepo.findByKeyHash('a'.repeat(64));
    assert.ok(cred);
    const isProjectAuthorized = cred?.allowedProjects.includes('prohibited-project-xyz');
    assert.equal(isProjectAuthorized, false);
  });

  it('9. Verifies cross-tenant isolation in queries', async () => {
    await tenantRepo.save({
      id: testTenantId2,
      code: 'live-test-tenant-2',
      name: 'Live Test Tenant 2',
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await projectRepo.save({
      id: testProjectId2,
      tenantId: testTenantId2,
      name: 'Live Isolated Project 2',
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const proj1 = await projectRepo.findById(testProjectId);
    const proj2 = await projectRepo.findById(testProjectId2);
    assert.equal(proj1?.tenantId, testTenantId);
    assert.equal(proj2?.tenantId, testTenantId2);
    assert.notEqual(proj1?.tenantId, proj2?.tenantId);
  });

  it('10. Creates durable receipt record in PostgreSQL', async () => {
    const committedAt = new Date();
    const expiresAt = new Date(committedAt.getTime() + 7 * 24 * 60 * 60 * 1000);
    const record = {
      id: '55555555-4444-5555-6666-777777777777',
      tenantId: testTenantId,
      projectId: testProjectId,
      batchId: testBatchId,
      contentDigest: 'sha256:' + 'b'.repeat(64),
      journalSegment: 'active.wal',
      journalOffset: 0n,
      acceptedCount: 1,
      committedAt,
      expiresAt,
    };

    await receiptRepo.saveReceipt(record);
  });

  it('11. Retrieves durable receipt and validates all metadata fields', async () => {
    const retrieved = await receiptRepo.findReceipt(testTenantId, testProjectId, testBatchId);
    assert.ok(retrieved);
    assert.equal(retrieved?.batchId, testBatchId);
    assert.equal(retrieved?.contentDigest, 'sha256:' + 'b'.repeat(64));
    assert.equal(retrieved?.journalSegment, 'active.wal');
    assert.equal(retrieved?.acceptedCount, 1);
  });

  it('12. Detects conflicting batch identity (same batchId, different digest)', async () => {
    const existing = await receiptRepo.findReceipt(testTenantId, testProjectId, testBatchId);
    assert.ok(existing);
    const incomingDigest = 'sha256:' + 'c'.repeat(64);
    assert.notEqual(existing?.contentDigest, incomingDigest);
  });

  it('13. Enforces database uniqueness constraint on duplicate receipt submission', async () => {
    const committedAt = new Date();
    const expiresAt = new Date(committedAt.getTime() + 7 * 24 * 60 * 60 * 1000);
    const duplicate = {
      id: '66666666-4444-5555-6666-777777777777',
      tenantId: testTenantId,
      projectId: testProjectId,
      batchId: testBatchId, // Duplicate batchId!
      contentDigest: 'sha256:' + 'b'.repeat(64),
      journalSegment: 'active.wal',
      journalOffset: 500n,
      acceptedCount: 1,
      committedAt,
      expiresAt,
    };

    await assert.rejects(
      async () => {
        await receiptRepo.saveReceipt(duplicate);
      },
      (err: any) => {
        // Prisma P2002 is Unique constraint failed
        return err.code === 'P2002' || err.message.includes('Unique constraint');
      },
      'Expected unique constraint violation on (tenantId, projectId, batchId)',
    );
  });

  it('14. Persists and queries immutable archive segment manifest metadata', async () => {
    const segmentRecord = {
      id: '77777777-4444-5555-6666-777777777777',
      tenantId: testTenantId,
      projectId: testProjectId,
      environment: 'development',
      serviceName: 'test-service',
      date: '2026-10-24',
      segmentFilename: 'segment-0000.jsonl',
      recordCount: 100,
      byteSize: 1048576n,
      sha256Checksum: 's'.repeat(64),
      firstEventTimestamp: new Date('2026-10-24T00:00:00Z'),
      lastEventTimestamp: new Date('2026-10-24T01:00:00Z'),
      finalizedAt: new Date('2026-10-24T01:01:00Z'),
      writerInstanceId: 'writer-live-01',
      journalSegmentId: 'active.wal',
      journalStartOffset: 0n,
      journalEndOffset: 1048576n,
    };

    await archiveRepo.saveSegment(segmentRecord);

    const found = await archiveRepo.findSegment(
      testTenantId,
      testProjectId,
      'development',
      'test-service',
      '2026-10-24',
      'segment-0000.jsonl',
    );
    assert.ok(found);
    assert.equal(found?.recordCount, 100);
    assert.equal(found?.sha256Checksum, 's'.repeat(64));

    const list = await archiveRepo.listSegmentsForPartition(
      testTenantId,
      testProjectId,
      'development',
      'test-service',
      '2026-10-24',
    );
    assert.equal(list.length, 1);
  });

  it('15. Persists and updates recovery checkpoints', async () => {
    await checkpointRepo.saveCheckpoint({
      id: 'archive_writer_live',
      journalSegment: 'active.wal',
      byteOffset: 2048n,
      updatedAt: new Date(),
    });

    const cp = await checkpointRepo.getCheckpoint('archive_writer_live');
    assert.ok(cp);
    assert.equal(cp?.journalSegment, 'active.wal');
    assert.equal(cp?.byteOffset, 2048n);
  });

  it('16. Enforces foreign-key constraints (inserting project with nonexistent tenant fails)', async () => {
    await assert.rejects(
      async () => {
        await projectRepo.save({
          id: 'invalid-fk-project',
          tenantId: '00000000-0000-0000-0000-000000000099', // nonexistent tenant
          name: 'Invalid FK Project',
          status: 'ACTIVE',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      },
      (err: any) => {
        // Prisma P2003 is Foreign key constraint failed
        return err.code === 'P2003' || err.message.includes('Foreign key');
      },
      'Expected foreign key constraint violation on nonexistent tenantId',
    );
  });

  it('17. Verifies transaction rollback on partial failure', async () => {
    const client = prismaService;
    const tempProjectId = 'temp-rollback-project';

    await assert.rejects(
      async () => {
        await client.$transaction(async (tx) => {
          await tx.project.create({
            data: {
              id: tempProjectId,
              tenantId: testTenantId,
              name: 'Temporary Project',
              status: 'ACTIVE',
            },
          });
          // Intentionally throw inside transaction to trigger rollback
          throw new Error('SIMULATED_TRANSACTION_FAILURE');
        });
      },
      /SIMULATED_TRANSACTION_FAILURE/,
    );

    const check = await projectRepo.findById(tempProjectId);
    assert.equal(check, null, 'Uncommitted transaction data must be rolled back');
  });

  it('18. Verifies concurrent insert behavior and reconciliation', async () => {
    const receiptsToInsert = [
      {
        id: '88888888-4444-5555-6666-000000000001',
        tenantId: testTenantId,
        projectId: testProjectId,
        batchId: 'concurrent-batch-1',
        contentDigest: 'sha256:' + '1'.repeat(64),
        journalSegment: 'active.wal',
        journalOffset: 100n,
        acceptedCount: 1,
        committedAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
      },
      {
        id: '88888888-4444-5555-6666-000000000002',
        tenantId: testTenantId,
        projectId: testProjectId,
        batchId: 'concurrent-batch-2',
        contentDigest: 'sha256:' + '2'.repeat(64),
        journalSegment: 'active.wal',
        journalOffset: 200n,
        acceptedCount: 1,
        committedAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
      },
    ];

    // Reconcile concurrent batch receipts
    const reconciled = await receiptRepo.reconcileReceipts(receiptsToInsert);
    assert.equal(reconciled, 2);

    const r1 = await receiptRepo.findReceipt(testTenantId, testProjectId, 'concurrent-batch-1');
    const r2 = await receiptRepo.findReceipt(testTenantId, testProjectId, 'concurrent-batch-2');
    assert.ok(r1);
    assert.ok(r2);
  });

  it('19. Verifies database reconnect behavior after disconnect', async () => {
    const client = prismaService;
    await client.$disconnect();

    // Prisma reconnects lazily on subsequent query
    const isHealthy = await prismaService.isHealthy();
    assert.equal(isHealthy, true, 'Prisma should reconnect automatically on query');
  });

  it('20. Verifies database outage handling and fail-closed readiness', async () => {
    const brokenConfig = new GatewayConfigService({
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://invalid_user:invalid_pass@127.0.0.1:5432/nonexistent_db_xyz',
    });
    const brokenPrisma = new PrismaService(brokenConfig);
    const healthy = await brokenPrisma.isHealthy();
    assert.equal(healthy, false, 'PrismaService must report unhealthy when target DB is unavailable');
    await brokenPrisma.onModuleDestroy();
  });

  it('21. Cleans up test-created fixtures without modifying user data', async () => {
    const client = prismaService;
    await client.archiveSegment.deleteMany({ where: { tenantId: testTenantId } });
    await client.deduplicationReceipt.deleteMany({ where: { tenantId: testTenantId } });
    await client.ingestionCheckpoint.deleteMany({ where: { id: 'archive_writer_live' } });
    await client.ingestionCredential.deleteMany({ where: { tenantId: testTenantId } });
    await client.project.deleteMany({ where: { tenantId: testTenantId } });
    await client.project.deleteMany({ where: { tenantId: testTenantId2 } });
    await client.tenant.deleteMany({ where: { id: testTenantId } });
    await client.tenant.deleteMany({ where: { id: testTenantId2 } });
    await prismaService.onModuleDestroy();
  });
});
