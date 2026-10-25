import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { GatewayConfigService } from '../../src/config/config.service.js';
import { MetadataModule } from '../../src/metadata/metadata.module.js';
import { HealthService } from '../../src/health/health.service.js';
import { PrismaService } from '../../src/metadata/prisma.service.js';
import { WalJournalService } from '../../src/storage/wal/wal-journal.service.js';
import { CREDENTIAL_REPOSITORY } from '../../src/metadata/repositories/credential.repository.interface.js';
import { PrismaCredentialRepository } from '../../src/metadata/repositories/prisma-credential.repository.js';
import { InMemoryCredentialRepository } from '../../src/metadata/repositories/in-memory-credential.repository.js';

describe('Production Dependency Injection & Configuration Hardening', () => {
  it('Production mode: rejects startup when DATABASE_URL is missing', () => {
    assert.throws(
      () => {
        new GatewayConfigService({
          NODE_ENV: 'production',
        });
      },
      (err: Error) => {
        assert.match(err.message, /Explicit, valid DATABASE_URL is required in production mode/);
        return true;
      },
    );
  });

  it('Production mode: rejects startup when DATABASE_URL contains placeholder REPLACE_ME', () => {
    assert.throws(
      () => {
        new GatewayConfigService({
          NODE_ENV: 'production',
          DATABASE_URL: 'postgresql://skyra_loghub_user:REPLACE_ME@localhost:5432/skyra_loghub_dev',
        });
      },
      (err: Error) => {
        assert.match(err.message, /Explicit, valid DATABASE_URL is required in production mode/);
        return true;
      },
    );
  });

  it('Production mode: rejects startup when DATABASE_URL has invalid protocol', () => {
    assert.throws(
      () => {
        new GatewayConfigService({
          NODE_ENV: 'production',
          DATABASE_URL: 'mysql://user:pass@localhost:3306/db',
        });
      },
      (err: Error) => {
        assert.match(err.message, /Invalid DATABASE_URL protocol/);
        return true;
      },
    );
  });

  it('Production mode: accepts valid postgresql:// DATABASE_URL', () => {
    const config = new GatewayConfigService({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://skyra_loghub_user:real_pass@localhost:5432/skyra_loghub_dev',
    });
    assert.equal(config.nodeEnv, 'production');
    assert.equal(config.databaseUrl, 'postgresql://skyra_loghub_user:real_pass@localhost:5432/skyra_loghub_dev');
  });

  it('Production mode: strictly forbids in-memory repositories via MetadataModule.forRoot', () => {
    const prevEnv = process.env['NODE_ENV'];
    try {
      process.env['NODE_ENV'] = 'production';
      assert.throws(
        () => {
          MetadataModule.forRoot({ useInMemory: true });
        },
        (err: Error) => {
          assert.match(err.message, /In-memory metadata repositories are strictly forbidden in production mode/);
          return true;
        },
      );
    } finally {
      process.env['NODE_ENV'] = prevEnv;
    }
  });

  it('Production mode: repository factory resolves to Prisma repository, never in-memory', () => {
    const config = new GatewayConfigService({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://skyra_loghub_user:real_pass@localhost:5432/skyra_loghub_dev',
    });
    const prismaService = new PrismaService(config);
    const prismaCredRepo = new PrismaCredentialRepository(prismaService);
    const inMemoryCredRepo = new InMemoryCredentialRepository();

    const moduleDef = MetadataModule.forRoot();
    const credProvider = (moduleDef.providers as any[]).find(
      (p) => p && typeof p === 'object' && p.provide === CREDENTIAL_REPOSITORY,
    );
    assert.ok(credProvider, 'CREDENTIAL_REPOSITORY provider must exist');

    const resolved = credProvider.useFactory(config, prismaCredRepo, inMemoryCredRepo);
    assert.strictEqual(resolved, prismaCredRepo, 'Must resolve to Prisma repository in production');
    assert.notStrictEqual(resolved, inMemoryCredRepo, 'Must NEVER resolve to in-memory in production');
  });

  it('Production mode: readiness check returns 503 not_ready when PostgreSQL is disconnected', async () => {
    const config = new GatewayConfigService({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://skyra_loghub_user:real_pass@localhost:5432/skyra_loghub_dev',
    });
    const mockPrisma = {
      isHealthy: async () => false,
    } as unknown as PrismaService;

    const mockWal = {
      getStatus: () => ({
        isReady: true,
        walDir: '/tmp/wal',
        currentOffset: 100,
        activeSegment: 'active.wal',
        isRecoveryRequired: false,
        recoveryError: null,
        committedCount: 1,
      }),
    } as unknown as WalJournalService;

    const health = new HealthService(mockPrisma, mockWal, config);
    const readiness = await health.getReadiness();

    assert.equal(readiness.status, 'not_ready');
    assert.equal(readiness.database, 'disconnected');
    assert.match(readiness.reason!, /PostgreSQL database connection is required in production mode/);
  });
});
