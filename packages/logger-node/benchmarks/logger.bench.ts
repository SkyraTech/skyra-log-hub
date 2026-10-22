import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createSkyraLogger } from '../dist/index.js';
import { buildCanonicalLogEvent } from '../dist/event-builder.js';
import { formatJsonlEvent } from '../dist/formatter.js';
import { redactSensitiveData, validateLogEvent } from '@skyra/logger-core';
import { DEFAULT_RESOURCE_LIMITS } from '../dist/config.js';

const BENCH_DIR = path.resolve('./temp-bench-logs');

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))]!;
}

interface BenchmarkResult {
  scenario: string;
  submitted: number;
  accepted: number;
  written: number;
  dropped: number;
  fsynced: number;
  durationMs: number;
  effectiveThroughputOpsSec: number;
  avgEnqueueUs: number;
  p50EnqueueUs: number;
  p95EnqueueUs: number;
  p99EnqueueUs: number;
  diskThroughputMBs: number;
  drainLatencyMs: number;
  heapUsedMB: number;
}

async function runBenchmark(): Promise<void> {
  if (fs.existsSync(BENCH_DIR)) {
    fs.rmSync(BENCH_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(BENCH_DIR, { recursive: true });

  console.log('='.repeat(80));
  console.log('SKYRA LOGHUB — NODE.JS LOGGER HARDENED PERFORMANCE BENCHMARK (LOGHUB-PKG-002A)');
  console.log('='.repeat(80));
  console.log(`OS: ${os.type()} ${os.release()} (${os.arch()})`);
  console.log(`CPU: ${os.cpus()[0]?.model} (${os.cpus().length} cores)`);
  console.log(`Node.js Version: ${process.version}`);
  console.log(`Memory: ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(2)} GB total`);
  console.log(`Benchmark Directory: ${BENCH_DIR}`);
  console.log('-'.repeat(80));

  const results: BenchmarkResult[] = [];

  // Scenario 1: Small Informational Events (10,000 events)
  {
    const count = 10_000;
    const logger = createSkyraLogger({
      projectId: 'bench-proj',
      serviceName: 'bench-svc',
      environment: 'production',
      instanceId: 'bench-inst-1',
      transport: { type: 'file', directory: BENCH_DIR },
    });

    const latenciesUs: number[] = [];
    const startTime = performance.now();

    for (let i = 0; i < count; i++) {
      const t0 = performance.now();
      logger.info('Application health check passed');
      const t1 = performance.now();
      latenciesUs.push((t1 - t0) * 1000);
    }

    const tFlush0 = performance.now();
    await logger.flush();
    const tFlush1 = performance.now();
    const drainLatencyMs = tFlush1 - tFlush0;
    const totalDurationMs = performance.now() - startTime;

    const status = logger.getStatus();
    await logger.close();

    latenciesUs.sort((a, b) => a - b);
    const avgLatency = latenciesUs.reduce((a, b) => a + b, 0) / latenciesUs.length;

    results.push({
      scenario: 'Small Informational Events',
      submitted: status.totalEventsSubmitted,
      accepted: status.totalEventsAccepted,
      written: status.totalEventsWritten,
      dropped: status.totalEventsDropped,
      fsynced: status.totalEventsFsynced,
      durationMs: Number(totalDurationMs.toFixed(1)),
      effectiveThroughputOpsSec: Math.round((status.totalEventsWritten / totalDurationMs) * 1000),
      avgEnqueueUs: Number(avgLatency.toFixed(2)),
      p50EnqueueUs: Number(percentile(latenciesUs, 50).toFixed(2)),
      p95EnqueueUs: Number(percentile(latenciesUs, 95).toFixed(2)),
      p99EnqueueUs: Number(percentile(latenciesUs, 99).toFixed(2)),
      diskThroughputMBs: Number(((status.totalBytesWritten / 1024 / 1024) / (totalDurationMs / 1000)).toFixed(2)),
      drainLatencyMs: Number(drainLatencyMs.toFixed(2)),
      heapUsedMB: Number((process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)),
    });
  }

  // Scenario 2: Typical Structured HTTP Events with Metadata (10,000 events)
  {
    const count = 10_000;
    const logger = createSkyraLogger({
      projectId: 'bench-proj',
      serviceName: 'bench-svc',
      environment: 'production',
      instanceId: 'bench-inst-2',
      transport: { type: 'file', directory: BENCH_DIR },
    });

    const latenciesUs: number[] = [];
    const startTime = performance.now();

    for (let i = 0; i < count; i++) {
      const t0 = performance.now();
      logger.info('GET /api/v1/projects completed', {
        component: 'api-gateway',
        action: 'http.request.completed',
        outcome: 'success',
        durationMs: 42.5,
        traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
        spanId: '00f067aa0ba902b7',
        http: {
          request: { method: 'GET', id: `req-${i}` },
          response: { status_code: 200, bytes: 1420 },
          route: '/api/v1/projects',
        },
        client: { ip: '10.0.4.15', port: 44321 },
        user: { id: 'usr-9872', roles: ['developer'] },
      });
      const t1 = performance.now();
      latenciesUs.push((t1 - t0) * 1000);
    }

    const tFlush0 = performance.now();
    await logger.flush();
    const tFlush1 = performance.now();
    const drainLatencyMs = tFlush1 - tFlush0;
    const totalDurationMs = performance.now() - startTime;

    const status = logger.getStatus();
    await logger.close();

    latenciesUs.sort((a, b) => a - b);
    const avgLatency = latenciesUs.reduce((a, b) => a + b, 0) / latenciesUs.length;

    results.push({
      scenario: 'Typical Structured Events',
      submitted: status.totalEventsSubmitted,
      accepted: status.totalEventsAccepted,
      written: status.totalEventsWritten,
      dropped: status.totalEventsDropped,
      fsynced: status.totalEventsFsynced,
      durationMs: Number(totalDurationMs.toFixed(1)),
      effectiveThroughputOpsSec: Math.round((status.totalEventsWritten / totalDurationMs) * 1000),
      avgEnqueueUs: Number(avgLatency.toFixed(2)),
      p50EnqueueUs: Number(percentile(latenciesUs, 50).toFixed(2)),
      p95EnqueueUs: Number(percentile(latenciesUs, 95).toFixed(2)),
      p99EnqueueUs: Number(percentile(latenciesUs, 99).toFixed(2)),
      diskThroughputMBs: Number(((status.totalBytesWritten / 1024 / 1024) / (totalDurationMs / 1000)).toFixed(2)),
      drainLatencyMs: Number(drainLatencyMs.toFixed(2)),
      heapUsedMB: Number((process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)),
    });
  }

  // Scenario 3: Error Events with Stack Traces & Redaction + Fsync (5,000 events)
  {
    const count = 5_000;
    const logger = createSkyraLogger({
      projectId: 'bench-proj',
      serviceName: 'bench-svc',
      environment: 'production',
      instanceId: 'bench-inst-3',
      transport: { type: 'file', directory: BENCH_DIR },
    });

    const latenciesUs: number[] = [];
    const startTime = performance.now();

    for (let i = 0; i < count; i++) {
      const err = new Error(`Connection timeout during transaction ${i}`);
      err.name = 'TimeoutError';

      const t0 = performance.now();
      logger.error('Database transaction failed', {
        component: 'billing',
        error: err,
        password: 'rawPasswordToScrub',
        authorization: 'Bearer token-to-redact-1234567890',
        database: {
          system: 'postgresql',
          statement_sanitized: 'UPDATE accounts SET balance = balance - 100 WHERE id = 1',
        },
      });
      const t1 = performance.now();
      latenciesUs.push((t1 - t0) * 1000);
    }

    const tFlush0 = performance.now();
    await logger.flush();
    const tFlush1 = performance.now();
    const drainLatencyMs = tFlush1 - tFlush0;
    const totalDurationMs = performance.now() - startTime;

    const status = logger.getStatus();
    await logger.close();

    latenciesUs.sort((a, b) => a - b);
    const avgLatency = latenciesUs.reduce((a, b) => a + b, 0) / latenciesUs.length;

    results.push({
      scenario: 'Errors with Stack Trace & Fsync',
      submitted: status.totalEventsSubmitted,
      accepted: status.totalEventsAccepted,
      written: status.totalEventsWritten,
      dropped: status.totalEventsDropped,
      fsynced: status.totalEventsFsynced,
      durationMs: Number(totalDurationMs.toFixed(1)),
      effectiveThroughputOpsSec: Math.round((status.totalEventsWritten / totalDurationMs) * 1000),
      avgEnqueueUs: Number(avgLatency.toFixed(2)),
      p50EnqueueUs: Number(percentile(latenciesUs, 50).toFixed(2)),
      p95EnqueueUs: Number(percentile(latenciesUs, 95).toFixed(2)),
      p99EnqueueUs: Number(percentile(latenciesUs, 99).toFixed(2)),
      diskThroughputMBs: Number(((status.totalBytesWritten / 1024 / 1024) / (totalDurationMs / 1000)).toFixed(2)),
      drainLatencyMs: Number(drainLatencyMs.toFixed(2)),
      heapUsedMB: Number((process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)),
    });
  }

  // Scenario 4: High-Burst Logging (20,000 events queued in rapid succession)
  {
    const count = 20_000;
    const logger = createSkyraLogger({
      projectId: 'bench-proj',
      serviceName: 'bench-svc',
      environment: 'production',
      instanceId: 'bench-inst-4',
      transport: { type: 'file', directory: BENCH_DIR },
    });

    const latenciesUs: number[] = [];
    const startTime = performance.now();

    for (let i = 0; i < count; i++) {
      const t0 = performance.now();
      logger.info(`Burst event ${i}`, { index: i, burst: true });
      const t1 = performance.now();
      latenciesUs.push((t1 - t0) * 1000);
    }

    const tFlush0 = performance.now();
    await logger.flush();
    const tFlush1 = performance.now();
    const drainLatencyMs = tFlush1 - tFlush0;
    const totalDurationMs = performance.now() - startTime;

    const status = logger.getStatus();
    await logger.close();

    latenciesUs.sort((a, b) => a - b);
    const avgLatency = latenciesUs.reduce((a, b) => a + b, 0) / latenciesUs.length;

    results.push({
      scenario: 'High-Burst Logging (20k events)',
      submitted: status.totalEventsSubmitted,
      accepted: status.totalEventsAccepted,
      written: status.totalEventsWritten,
      dropped: status.totalEventsDropped,
      fsynced: status.totalEventsFsynced,
      durationMs: Number(totalDurationMs.toFixed(1)),
      effectiveThroughputOpsSec: Math.round((status.totalEventsWritten / totalDurationMs) * 1000),
      avgEnqueueUs: Number(avgLatency.toFixed(2)),
      p50EnqueueUs: Number(percentile(latenciesUs, 50).toFixed(2)),
      p95EnqueueUs: Number(percentile(latenciesUs, 95).toFixed(2)),
      p99EnqueueUs: Number(percentile(latenciesUs, 99).toFixed(2)),
      diskThroughputMBs: Number(((status.totalBytesWritten / 1024 / 1024) / (totalDurationMs / 1000)).toFixed(2)),
      drainLatencyMs: Number(drainLatencyMs.toFixed(2)),
      heapUsedMB: Number((process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)),
    });
  }

  // Cost Breakdown: Micro-benchmark of isolated components (10,000 iterations)
  const compCount = 10_000;
  const mockConfig: any = {
    projectId: 'bench-proj',
    serviceName: 'bench-svc',
    environment: 'production',
    instanceId: 'inst-01',
    limits: DEFAULT_RESOURCE_LIMITS,
    clock: () => new Date(),
    additionalSensitiveKeys: [],
    validationMode: 'off',
  };

  // Component 1: Event Building & UUID Generation
  let t0 = performance.now();
  const sampleEvents: any[] = [];
  for (let i = 0; i < compCount; i++) {
    sampleEvents.push(buildCanonicalLogEvent(mockConfig, 'info', 'Message', { comp: 'api' }));
  }
  const eventBuildTimeMs = performance.now() - t0;

  // Component 2: JSON Serialization (formatJsonlEvent)
  t0 = performance.now();
  for (let i = 0; i < compCount; i++) {
    formatJsonlEvent(sampleEvents[i]!, false);
  }
  const jsonSerializeTimeMs = performance.now() - t0;

  // Component 3: Redaction Cost
  const rawObj = {
    password: 'secretPassword123',
    token: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.secret',
    user: { email: 'user@skyra.internal', auth: 'Bearer secret' },
    db: 'postgres://admin:pass@host:5432/db',
  };
  t0 = performance.now();
  for (let i = 0; i < compCount; i++) {
    redactSensitiveData(rawObj);
  }
  const redactionTimeMs = performance.now() - t0;

  // Component 4: Schema Validation Cost (validateLogEvent)
  t0 = performance.now();
  for (let i = 0; i < compCount; i++) {
    validateLogEvent(sampleEvents[i]!);
  }
  const validationTimeMs = performance.now() - t0;

  // Print Summary Table
  console.log('\n--- WORKLOAD BENCHMARK SUMMARY ---');
  console.table(results);

  console.log('\n--- COMPONENT OVERHEAD BREAKDOWN (10,000 iterations) ---');
  console.log(`1. Canonical Event Build + UUIDv4: ${eventBuildTimeMs.toFixed(2)} ms (${(eventBuildTimeMs / compCount * 1000).toFixed(2)} µs/op)`);
  console.log(`2. JSONL Serialization (JSON.stringify): ${jsonSerializeTimeMs.toFixed(2)} ms (${(jsonSerializeTimeMs / compCount * 1000).toFixed(2)} µs/op)`);
  console.log(`3. Deep Sensitive Data Redaction: ${redactionTimeMs.toFixed(2)} ms (${(redactionTimeMs / compCount * 1000).toFixed(2)} µs/op)`);
  console.log(`4. Ajv 2020 Schema Validation: ${validationTimeMs.toFixed(2)} ms (${(validationTimeMs / compCount * 1000).toFixed(2)} µs/op)`);
  console.log('='.repeat(80));

  try {
    fs.rmSync(BENCH_DIR, { recursive: true, force: true });
  } catch {}
}

runBenchmark().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
