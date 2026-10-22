/**
 * @skyra/logger-browser - Performance Overhead & Latency Benchmarks
 */

import { performance } from 'node:perf_hooks';
import os from 'node:os';
import { validateLogEvent } from '@skyra/logger-core/validator';
import { redactSensitiveData } from '@skyra/logger-core/redaction';
import {
  createSkyraBrowserLogger,
  MemoryTransport,
  HttpTransport,
  formatBrowserBatch,
  type SkyraLogEvent,
} from '../dist/index.js';

interface BenchStats {
  readonly count: number;
  readonly durationMs: number;
  readonly opsPerSec: number;
  readonly meanMs: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
}

function calculateStats(latencies: number[], totalMs: number): BenchStats {
  latencies.sort((a, b) => a - b);
  const count = latencies.length;
  const p50 = latencies[Math.floor(count * 0.5)] ?? 0;
  const p95 = latencies[Math.floor(count * 0.95)] ?? 0;
  const p99 = latencies[Math.floor(count * 0.99)] ?? 0;
  const sum = latencies.reduce((acc, v) => acc + v, 0);

  return {
    count,
    durationMs: totalMs,
    opsPerSec: Number(((count / (totalMs / 1000))).toFixed(1)),
    meanMs: Number((sum / count).toFixed(4)),
    p50Ms: Number(p50.toFixed(4)),
    p95Ms: Number(p95.toFixed(4)),
    p99Ms: Number(p99.toFixed(4)),
  };
}

async function runBenchmarks() {
  console.log('================================================================');
  console.log('  SKYRA LOGHUB: BROWSER LOGGING SDK BENCHMARK (TASK 006)');
  console.log('================================================================');
  console.log(`OS: ${os.type()} ${os.release()} (${os.arch()})`);
  console.log(`CPU: ${os.cpus()[0]?.model} (${os.cpus().length} logical cores)`);
  console.log(`Node.js: ${process.version}`);
  console.log(`Memory: ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(1)} GB RAM`);
  console.log('----------------------------------------------------------------\n');

  // Scenario 1: Lightweight Info Event (Memory Transport)
  {
    const memory = new MemoryTransport({ maxEvents: 20000 });
    const logger = createSkyraBrowserLogger({
      projectId: 'bench-portal',
      serviceName: 'portal-web',
      environment: 'production',
      transport: memory,
      validateEvents: false,
      limits: { maxQueueEvents: 20000, maxQueueBytes: 50 * 1024 * 1024 },
    });

    const ITERATIONS = 10000;
    const latencies: number[] = new Array(ITERATIONS);

    const startTotal = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      const t0 = performance.now();
      logger.info('Widget clicked', { widget_id: 'w-100' });
      latencies[i] = performance.now() - t0;
    }
    await logger.flush();
    const endTotal = performance.now();

    const stats = calculateStats(latencies, endTotal - startTotal);
    console.log(`[Scenario 1: Lightweight Info Event (10k events)]`);
    console.log(`  Throughput: ${stats.opsPerSec.toLocaleString()} ops/sec`);
    console.log(`  Latency: mean=${stats.meanMs}ms, p50=${stats.p50Ms}ms, p95=${stats.p95Ms}ms, p99=${stats.p99Ms}ms`);
    console.log(`  Events Delivered: ${memory.getEventCount()} / ${ITERATIONS}\n`);
  }

  // Scenario 2: Nested Metadata & Redaction Engine
  {
    const memory = new MemoryTransport({ maxEvents: 20000 });
    const logger = createSkyraBrowserLogger({
      projectId: 'bench-portal',
      serviceName: 'portal-web',
      environment: 'production',
      transport: memory,
      validateEvents: false,
      limits: { maxQueueEvents: 20000, maxQueueBytes: 50 * 1024 * 1024 },
    });

    const ITERATIONS = 10000;
    const latencies: number[] = new Array(ITERATIONS);

    const payload = {
      user: {
        id: 'usr-4819',
        name: 'John Doe',
        password: 'SuperSecretPassword123!',
        token: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.t-IDcSemACt8x4iTMCda8Yhe3iZaWbvV5XKSTbuAn0M',
      },
      order: {
        id: 'ord-9921',
        total: 149.99,
        credit_card: '4111 1111 1111 1111',
      },
    };

    const startTotal = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      const t0 = performance.now();
      logger.info('User completed checkout', payload);
      latencies[i] = performance.now() - t0;
    }
    await logger.flush();
    const endTotal = performance.now();

    const stats = calculateStats(latencies, endTotal - startTotal);
    console.log(`[Scenario 2: Nested Metadata & Deep Redaction (10k events)]`);
    console.log(`  Throughput: ${stats.opsPerSec.toLocaleString()} ops/sec`);
    console.log(`  Latency: mean=${stats.meanMs}ms, p50=${stats.p50Ms}ms, p95=${stats.p95Ms}ms, p99=${stats.p99Ms}ms`);
    console.log(`  Events Delivered: ${memory.getEventCount()} / ${ITERATIONS}\n`);
  }

  // Scenario 3: Browser Error with Stack Trace
  {
    const memory = new MemoryTransport({ maxEvents: 20000 });
    const logger = createSkyraBrowserLogger({
      projectId: 'bench-portal',
      serviceName: 'portal-web',
      environment: 'production',
      transport: memory,
      validateEvents: false,
      limits: { maxQueueEvents: 20000, maxQueueBytes: 50 * 1024 * 1024 },
    });

    const ITERATIONS = 10000;
    const latencies: number[] = new Array(ITERATIONS);

    const startTotal = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      const t0 = performance.now();
      const err = new TypeError('Failed to load dynamic component chunk [404]');
      logger.error('Unhandled runtime exception', { error: err });
      latencies[i] = performance.now() - t0;
    }
    await logger.flush();
    const endTotal = performance.now();

    const stats = calculateStats(latencies, endTotal - startTotal);
    console.log(`[Scenario 3: Error with Stack Serialization (10k events)]`);
    console.log(`  Throughput: ${stats.opsPerSec.toLocaleString()} ops/sec`);
    console.log(`  Latency: mean=${stats.meanMs}ms, p50=${stats.p50Ms}ms, p95=${stats.p95Ms}ms, p99=${stats.p99Ms}ms`);
    console.log(`  Events Delivered: ${memory.getEventCount()} / ${ITERATIONS}\n`);
  }

  // Scenario 4: Canonical Schema Validation (Ajv Draft 2020)
  {
    const sampleEvent: SkyraLogEvent = {
      '@timestamp': new Date().toISOString(),
      'ecs.version': '8.11.0',
      event: { id: '00000000-0000-4000-8000-000000000001', action: 'http.request.completed' },
      log: { level: 'info' },
      message: 'Benchmarking canonical validator',
      service: { name: 'portal-web', environment: 'production' },
      skyra: { project_id: 'skyra-portal', schema_version: '1.0.0', component: 'ui' },
    };

    const ITERATIONS = 10000;
    const latencies: number[] = new Array(ITERATIONS);

    const startTotal = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      const t0 = performance.now();
      validateLogEvent(sampleEvent);
      latencies[i] = performance.now() - t0;
    }
    const endTotal = performance.now();

    const stats = calculateStats(latencies, endTotal - startTotal);
    console.log(`[Scenario 4: Ajv Draft 2020 Canonical Schema Validation (10k items)]`);
    console.log(`  Throughput: ${stats.opsPerSec.toLocaleString()} ops/sec`);
    console.log(`  Latency: mean=${stats.meanMs}ms, p50=${stats.p50Ms}ms, p95=${stats.p95Ms}ms, p99=${stats.p99Ms}ms\n`);
  }

  // Scenario 5: High-Frequency Queue Saturation & Priority Eviction
  {
    const memory = new MemoryTransport({ maxEvents: 20000 });
    const logger = createSkyraBrowserLogger({
      projectId: 'bench-portal',
      serviceName: 'portal-web',
      environment: 'production',
      transport: memory,
      immediateFlushLevels: [], // buffer only
      limits: {
        maxQueueEvents: 1000,
      },
    });

    const ITERATIONS = 10000;
    const startTotal = performance.now();

    for (let i = 0; i < 9000; i++) {
      logger.info(`Info event ${i}`);
    }
    for (let i = 0; i < 1000; i++) {
      logger.error(`Critical error event ${i}`);
    }

    const endTotal = performance.now();
    const status = logger.getStatus();

    console.log(`[Scenario 5: Queue Saturation & Eviction (10k burst into 1k buffer)]`);
    console.log(`  Burst Enqueue Time: ${(endTotal - startTotal).toFixed(2)}ms`);
    console.log(`  Accepted: ${status.acceptedCount}, Delivered: ${status.deliveredCount}, Dropped: ${status.droppedCount}, Evicted: ${status.evictedCount}`);
    console.log(`  Queue Depth: ${status.queueDepth} (Bounded <= 1,000)\n`);
  }

  // Scenario 6: JSON Batch Serialization (100 batches of 100 events)
  {
    const memory = new MemoryTransport({ maxEvents: 20000 });
    const logger = createSkyraBrowserLogger({
      projectId: 'bench-portal',
      serviceName: 'portal-web',
      environment: 'production',
      transport: memory,
    });

    for (let i = 0; i < 100; i++) {
      logger.info(`Event ${i}`, { seq: i, timestamp: Date.now() });
    }
    await logger.flush();
    const batch = memory.getEvents();

    const ITERATIONS = 1000;
    const latencies: number[] = new Array(ITERATIONS);
    let serializedBytes = 0;

    const startTotal = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      const t0 = performance.now();
      const jsonStr = formatBrowserBatch(batch);
      serializedBytes = jsonStr.length;
      latencies[i] = performance.now() - t0;
    }
    const endTotal = performance.now();

    const stats = calculateStats(latencies, endTotal - startTotal);
    console.log(`[Scenario 6: JSON Batch Serialization (1,000 batches of 100 events)]`);
    console.log(`  Throughput: ${stats.opsPerSec.toLocaleString()} batches/sec`);
    console.log(`  Batch Byte Size: ${(serializedBytes / 1024).toFixed(2)} KiB`);
    console.log(`  Latency: mean=${stats.meanMs}ms, p50=${stats.p50Ms}ms, p95=${stats.p95Ms}ms, p99=${stats.p99Ms}ms\n`);
  }

  console.log('================================================================');
  console.log('  ALL BROWSER SDK BENCHMARK SCENARIOS COMPLETED');
  console.log('================================================================');
}

runBenchmarks().catch(console.error);
