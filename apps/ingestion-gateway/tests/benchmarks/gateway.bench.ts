import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { parseStrictJson } from '@skyra/logger-core';
import { AppModule } from '../../src/app.module.js';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter.js';
import { InMemoryCredentialRepository } from '../../src/metadata/repositories/in-memory-credential.repository.js';
import { InMemoryProjectRepository } from '../../src/metadata/repositories/in-memory-project.repository.js';
import { InMemoryTenantRepository } from '../../src/metadata/repositories/in-memory-tenant.repository.js';
import { WalJournalService } from '../../src/storage/wal/wal-journal.service.js';
import { createValidLogEvent } from '../fixtures/valid-event.fixture.js';

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)] ?? 0;
}

async function runBenchmark() {
  console.log('\n========================================================================');
  console.log('   SKYRA LOGHUB DURABLE INGESTION (WAL + fsync) PERFORMANCE BENCHMARK');
  console.log('   Task: LOGHUB-ING-003 — Real Non-Volatile Persistence Verification');
  console.log('========================================================================\n');

  const tempBenchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyra-bench-wal-'));
  process.env['WAL_DIRECTORY'] = tempBenchDir;
  process.env['ARCHIVE_ROOT'] = path.join(tempBenchDir, 'archive');

  const adapter = new FastifyAdapter({
    bodyLimit: 10 * 1024 * 1024,
    logger: false,
  });

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
    logger: false,
  });

  app.useGlobalFilters(new HttpExceptionFilter());

  await app.init();

  const fastifyInstance = app.getHttpAdapter().getInstance();
  fastifyInstance.removeContentTypeParser('application/json');
  fastifyInstance.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_req: any, body: string, done: any) => {
      try {
        if (!body || body.trim() === '') {
          done(null, {});
          return;
        }
        const parsed = parseStrictJson(body);
        done(null, parsed);
      } catch (err) {
        done(err);
      }
    },
  );

  await app.getHttpAdapter().getInstance().ready();

  const credRepo = app.get(InMemoryCredentialRepository);
  const projRepo = app.get(InMemoryProjectRepository);
  const tenantRepo = app.get(InMemoryTenantRepository);
  const walService = app.get(WalJournalService);

  const tenantId = '00000000-0000-0000-0000-000000000001';
  const projectId = 'skyra-tech';
  const rawToken = 'sk_live_benchmark_token_durable_003';
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  await tenantRepo.save({
    id: tenantId,
    code: 'skyra-internal',
    name: 'Skyra Internal',
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await projRepo.save({
    id: projectId,
    tenantId,
    name: 'Skyra Tech Platform',
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await credRepo.save({
    id: 'cred-bench',
    tenantId,
    keyHash: tokenHash,
    keyPrefix: 'sk_live_bench',
    description: 'Durable Benchmark Token',
    allowedProjects: [projectId],
    allowedEnvironments: ['production'],
    rateLimitPerMin: 10_000_000,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 86400000),
    isRevoked: false,
    lastUsedAt: null,
  });

  // Warmup with physical fsync
  console.log('Running physical WAL fsync warmup (20 batches)...');
  for (let i = 0; i < 20; i++) {
    await app.inject({
      method: 'POST',
      url: '/ingest/v1/logs',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${rawToken}`,
      },
      payload: JSON.stringify({
        protocol_version: '1.0',
        batch_id: crypto.randomUUID(),
        sent_at: '2026-10-24T00:00:00.000Z',
        events: [createValidLogEvent()],
      }),
    });
  }

  // Multi-tier Batch Benchmark Matrix
  const testTiers = [
    { batchSize: 10, batchCount: 100, desc: 'Small Batches (10 events/batch)' },
    { batchSize: 50, batchCount: 50, desc: 'Medium Batches (50 events/batch)' },
    { batchSize: 200, batchCount: 20, desc: 'High-Density Batches (200 events/batch)' },
  ];

  for (const tier of testTiers) {
    const totalEvents = tier.batchSize * tier.batchCount;
    const latencies: number[] = [];
    let durablyAccepted = 0;
    let totalPayloadBytes = 0;

    const startMem = process.memoryUsage();
    const startTime = performance.now();

    for (let i = 0; i < tier.batchCount; i++) {
      const events = Array.from({ length: tier.batchSize }, () => createValidLogEvent());
      const payloadStr = JSON.stringify({
        protocol_version: '1.0',
        batch_id: crypto.randomUUID(),
        sent_at: '2026-10-24T00:00:00.000Z',
        events,
      });
      totalPayloadBytes += Buffer.byteLength(payloadStr, 'utf-8');

      const reqStart = performance.now();
      const res = await app.inject({
        method: 'POST',
        url: '/ingest/v1/logs',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${rawToken}`,
        },
        payload: payloadStr,
      });
      const reqEnd = performance.now();
      latencies.push(reqEnd - reqStart);

      if (res.statusCode === 200) {
        durablyAccepted++;
      }
    }

    const durationMs = performance.now() - startTime;
    const endMem = process.memoryUsage();

    const batchesPerSec = Math.round((tier.batchCount / durationMs) * 1000);
    const eventsPerSec = Math.round((totalEvents / durationMs) * 1000);
    const throughputMbSec = ((totalPayloadBytes / (1024 * 1024)) / (durationMs / 1000)).toFixed(2);
    const avgEventSizeBytes = Math.round(totalPayloadBytes / totalEvents);

    console.log(`\n--- TIER: ${tier.desc} ---`);
    console.log(`Total Durably Committed:     ${durablyAccepted}/${tier.batchCount} batches (${totalEvents} events)`);
    console.log(`Total Elapsed Time:          ${durationMs.toFixed(2)} ms`);
    console.log(`Batches/sec:                 ${batchesPerSec} batches/sec`);
    console.log(`Durable Ingestion Throughput: ${eventsPerSec} events/sec`);
    console.log(`Average Event Size:          ${avgEventSizeBytes} bytes`);
    console.log(`Effective WAL Throughput:    ${throughputMbSec} MB/sec`);
    console.log(`fsync Ack Latency (p50):     ${percentile(latencies, 50).toFixed(2)} ms`);
    console.log(`fsync Ack Latency (p95):     ${percentile(latencies, 95).toFixed(2)} ms`);
    console.log(`fsync Ack Latency (p99):     ${percentile(latencies, 99).toFixed(2)} ms`);
    console.log(`Delta Heap Used:             ${((endMem.heapUsed - startMem.heapUsed) / (1024 * 1024)).toFixed(2)} MB`);
  }

  // Benchmark Startup Recovery Duration
  console.log('\n--- STARTUP RECOVERY BENCHMARK ---');
  const activeWalPath = path.join(tempBenchDir, 'active.wal');
  const walFileSize = fs.existsSync(activeWalPath) ? fs.statSync(activeWalPath).size : 0;
  console.log(`Active WAL Segment on Disk:  ${walFileSize.toLocaleString()} bytes`);

  const reconStart = performance.now();
  const recoveredFrames = await walService.initialize();
  const reconTimeMs = performance.now() - reconStart;
  console.log(`Scanned & Recovered Batches: ${recoveredFrames.length}`);
  console.log(`Startup Recovery Time:       ${reconTimeMs.toFixed(3)} ms`);

  await app.close();

  // Cleanup temp dir
  try {
    fs.rmSync(tempBenchDir, { recursive: true, force: true });
  } catch {}

  console.log('\n========================================================================');
  console.log('   BENCHMARK COMPLETED SUCCESSFULLY');
  console.log('========================================================================\n');
}

void runBenchmark();
