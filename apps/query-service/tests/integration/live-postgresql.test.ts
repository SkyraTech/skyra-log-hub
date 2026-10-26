import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import { PrismaService } from '../../src/metadata/prisma.service.js';
import { PrismaArchiveSegmentRepository } from '../../src/modules/archive-discovery/infrastructure/prisma-archive-segment.repository.js';
import { QueryConfigService } from '../../src/config/query-config.service.js';

describe('Live PostgreSQL Read-Only Integration Tests (LOGHUB-QUERY-002)', () => {
  let prisma: PrismaService;
  let repo: PrismaArchiveSegmentRepository;
  let dbAvailable = false;

  before(async () => {
    const config = new QueryConfigService({
      nodeEnv: 'test',
      databaseUrl: process.env['DATABASE_URL'] ?? 'postgresql://skyra_loghub_user:REPLACE_ME@127.0.0.1:5432/skyra_loghub_dev?schema=public',
    });

    prisma = new PrismaService(config);
    repo = new PrismaArchiveSegmentRepository(prisma);

    try {
      dbAvailable = await prisma.isHealthy();
    } catch {
      dbAvailable = false;
    }
  });

  after(async () => {
    if (prisma) {
      await prisma.onModuleDestroy();
    }
  });

  it('should gracefully handle database state (live query or offline skip)', async (t) => {
    if (!dbAvailable) {
      t.skip('Live PostgreSQL database is not reachable. Skipping live database query.');
      return;
    }

    // If database is available, test read-only query
    const segments = await repo.findSegments({
      tenantId: '00000000-0000-0000-0000-000000000001',
      projectIds: ['skyra-tech'],
      limit: 10,
    });

    assert.ok(Array.isArray(segments));
  });
});
