import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createSkyraLogger } from '@skyra/logger-node';
import { SkyraLoggerService } from '../dist/skyra-logger.service.js';
import { RequestContextService } from '../dist/context/request-context.service.js';
import { SkyraCorrelationMiddleware } from '../dist/middleware/correlation.middleware.js';
import { buildHttpCompletedEventContext } from '../dist/internal/http-event-builder.js';
import { sanitizeRouteTemplate } from '../dist/internal/route-sanitizer.js';
import { sanitizeError } from '../dist/internal/error-sanitizer.js';

interface BenchmarkResult {
  name: string;
  iterations: number;
  totalTimeMs: number;
  opsPerSec: number;
  meanLatencyUs: number;
  p50LatencyUs: number;
  p95LatencyUs: number;
  p99LatencyUs: number;
  submitted: number;
  written: number;
  dropped: number;
  memoryDiffMb: number;
}

function calculatePercentiles(latenciesNs: number[]): {
  mean: number;
  p50: number;
  p95: number;
  p99: number;
} {
  latenciesNs.sort((a, b) => a - b);
  const total = latenciesNs.reduce((acc, v) => acc + v, 0);
  const meanUs = total / latenciesNs.length / 1_000;
  const p50Us = (latenciesNs[Math.floor(latenciesNs.length * 0.5)] || 0) / 1_000;
  const p95Us = (latenciesNs[Math.floor(latenciesNs.length * 0.95)] || 0) / 1_000;
  const p99Us = (latenciesNs[Math.floor(latenciesNs.length * 0.99)] || 0) / 1_000;

  return {
    mean: Number(meanUs.toFixed(2)),
    p50: Number(p50Us.toFixed(2)),
    p95: Number(p95Us.toFixed(2)),
    p99: Number(p99Us.toFixed(2)),
  };
}

async function runBenchmarks() {
  console.log('='.repeat(80));
  console.log('SKYRA LOGHUB — @skyra/logger-nestjs Performance & Overhead Benchmark');
  console.log(`OS: ${os.type()} ${os.release()} (${os.arch()}) | CPU: ${os.cpus()[0]?.model} (${os.cpus().length} cores)`);
  console.log(`Node.js: ${process.version} | V8: ${process.versions.v8} | Memory: ${Math.round(os.totalmem() / (1024 * 1024 * 1024))} GB`);
  console.log('='.repeat(80));

  const results: BenchmarkResult[] = [];
  const BENCH_DIR = path.resolve(process.cwd(), 'temp-bench-nestjs-logs');
  if (fs.existsSync(BENCH_DIR)) {
    fs.rmSync(BENCH_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(BENCH_DIR, { recursive: true });

  const ITERATIONS = 10_000;

  // -------------------------------------------------------------
  // Scenario 1: Baseline (No Logging Overhead)
  // -------------------------------------------------------------
  {
    const latencies: number[] = new Array(ITERATIONS);
    const memBefore = process.memoryUsage().heapUsed;
    const startBench = process.hrtime.bigint();

    for (let i = 0; i < ITERATIONS; i++) {
      const opStart = process.hrtime.bigint();
      // Simulated business logic
      const _order = { id: i, total: 100 };
      const opEnd = process.hrtime.bigint();
      latencies[i] = Number(opEnd - opStart);
    }

    const elapsedMs = Number(process.hrtime.bigint() - startBench) / 1_000_000;
    const memAfter = process.memoryUsage().heapUsed;
    const stats = calculatePercentiles(latencies);

    results.push({
      name: '1. Baseline (No Logging Overhead)',
      iterations: ITERATIONS,
      totalTimeMs: Number(elapsedMs.toFixed(2)),
      opsPerSec: Math.round((ITERATIONS / elapsedMs) * 1000),
      meanLatencyUs: stats.mean,
      p50LatencyUs: stats.p50,
      p95LatencyUs: stats.p95,
      p99LatencyUs: stats.p99,
      submitted: 0,
      written: 0,
      dropped: 0,
      memoryDiffMb: Number(((memAfter - memBefore) / (1024 * 1024)).toFixed(2)),
    });
  }

  // -------------------------------------------------------------
  // Scenario 2: Request Correlation (Middleware + AsyncLocalStorage Context)
  // -------------------------------------------------------------
  {
    const contextService = new RequestContextService();
    const middleware = new SkyraCorrelationMiddleware(contextService);
    const latencies: number[] = new Array(ITERATIONS);
    const memBefore = process.memoryUsage().heapUsed;
    const startBench = process.hrtime.bigint();

    for (let i = 0; i < ITERATIONS; i++) {
      const opStart = process.hrtime.bigint();
      const mockReq = {
        headers: {
          traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
          'x-request-id': `req-bench-${i}`,
        },
      };
      const mockRes = { setHeader: () => {} };

      middleware.use(mockReq as any, mockRes as any, () => {
        const _id = contextService.getRequestId();
        const _trace = contextService.getTraceId();
      });

      const opEnd = process.hrtime.bigint();
      latencies[i] = Number(opEnd - opStart);
    }

    const elapsedMs = Number(process.hrtime.bigint() - startBench) / 1_000_000;
    const memAfter = process.memoryUsage().heapUsed;
    const stats = calculatePercentiles(latencies);

    results.push({
      name: '2. Request Correlation (Middleware + Context)',
      iterations: ITERATIONS,
      totalTimeMs: Number(elapsedMs.toFixed(2)),
      opsPerSec: Math.round((ITERATIONS / elapsedMs) * 1000),
      meanLatencyUs: stats.mean,
      p50LatencyUs: stats.p50,
      p95LatencyUs: stats.p95,
      p99LatencyUs: stats.p99,
      submitted: 0,
      written: 0,
      dropped: 0,
      memoryDiffMb: Number(((memAfter - memBefore) / (1024 * 1024)).toFixed(2)),
    });
  }

  // -------------------------------------------------------------
  // Scenario 3: Basic HTTP Logging (Route Sanitization + Structured Build)
  // -------------------------------------------------------------
  {
    const rawLogger = createSkyraLogger({
      projectId: 'skyra-erp',
      serviceName: 'erp-api',
      environment: 'production',
      instanceId: 'inst-bench-01',
      level: 'info',
      transport: { type: 'stdout' },
    });
    // Stub transport write to benchmark serialization overhead without terminal throttling
    rawLogger.getTransport().write = async () => {};

    const service = new SkyraLoggerService(rawLogger);
    const latencies: number[] = new Array(ITERATIONS);
    const memBefore = process.memoryUsage().heapUsed;
    const startBench = process.hrtime.bigint();

    for (let i = 0; i < ITERATIONS; i++) {
      const opStart = process.hrtime.bigint();
      const routeTemplate = sanitizeRouteTemplate('/users/123e4567-e89b-12d3-a456-426614174000/orders?sort=asc');
      const eventContext = buildHttpCompletedEventContext({
        method: 'GET',
        statusCode: 200,
        durationMs: 14.5,
        durationNs: 14500000,
        routeTemplate,
        requestId: `req-bench-${i}`,
        traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
        spanId: '00f067aa0ba902b7',
      });

      service.info(`GET ${routeTemplate} 200 - 14.5ms`, eventContext);

      const opEnd = process.hrtime.bigint();
      latencies[i] = Number(opEnd - opStart);
    }

    await service.flush();
    const elapsedMs = Number(process.hrtime.bigint() - startBench) / 1_000_000;
    const memAfter = process.memoryUsage().heapUsed;
    const stats = calculatePercentiles(latencies);
    const status = service.getStatus();

    results.push({
      name: '3. Basic HTTP Event Build & Nonblocking Enqueue',
      iterations: ITERATIONS,
      totalTimeMs: Number(elapsedMs.toFixed(2)),
      opsPerSec: Math.round((ITERATIONS / elapsedMs) * 1000),
      meanLatencyUs: stats.mean,
      p50LatencyUs: stats.p50,
      p95LatencyUs: stats.p95,
      p99LatencyUs: stats.p99,
      submitted: status.totalEventsSubmitted,
      written: status.totalEventsWritten,
      dropped: status.totalEventsDropped,
      memoryDiffMb: Number(((memAfter - memBefore) / (1024 * 1024)).toFixed(2)),
    });

    await service.close();
  }

  // -------------------------------------------------------------
  // Scenario 4: Request + Exception Logging (Deep Sanitization)
  // -------------------------------------------------------------
  {
    const rawLogger = createSkyraLogger({
      projectId: 'skyra-erp',
      serviceName: 'erp-api',
      environment: 'production',
      instanceId: 'inst-bench-02',
      level: 'info',
      transport: { type: 'stdout' },
    });
    rawLogger.getTransport().write = async () => {};

    const service = new SkyraLoggerService(rawLogger);
    const latencies: number[] = new Array(ITERATIONS);
    const memBefore = process.memoryUsage().heapUsed;
    const startBench = process.hrtime.bigint();

    for (let i = 0; i < ITERATIONS; i++) {
      const opStart = process.hrtime.bigint();
      const simulatedException = new Error(`Database connection failed on query with token="secret-${i}"`);
      const sanitizedErr = sanitizeError(simulatedException);
      const routeTemplate = sanitizeRouteTemplate('/api/v1/checkout');
      const eventContext = buildHttpCompletedEventContext({
        method: 'POST',
        statusCode: 500,
        durationMs: 45.2,
        durationNs: 45200000,
        routeTemplate,
        requestId: `req-err-${i}`,
        traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
        spanId: '00f067aa0ba902b7',
        error: sanitizedErr,
      });

      service.error(`POST ${routeTemplate} 500 - 45.2ms`, eventContext);

      const opEnd = process.hrtime.bigint();
      latencies[i] = Number(opEnd - opStart);
    }

    await service.flush();
    const elapsedMs = Number(process.hrtime.bigint() - startBench) / 1_000_000;
    const memAfter = process.memoryUsage().heapUsed;
    const stats = calculatePercentiles(latencies);
    const status = service.getStatus();

    results.push({
      name: '4. Request + Exception Logging (Sanitization)',
      iterations: ITERATIONS,
      totalTimeMs: Number(elapsedMs.toFixed(2)),
      opsPerSec: Math.round((ITERATIONS / elapsedMs) * 1000),
      meanLatencyUs: stats.mean,
      p50LatencyUs: stats.p50,
      p95LatencyUs: stats.p95,
      p99LatencyUs: stats.p99,
      submitted: status.totalEventsSubmitted,
      written: status.totalEventsWritten,
      dropped: status.totalEventsDropped,
      memoryDiffMb: Number(((memAfter - memBefore) / (1024 * 1024)).toFixed(2)),
    });

    await service.close();
  }

  // -------------------------------------------------------------
  // Scenario 5: Full End-to-End JSONL File Transport Under Load
  // -------------------------------------------------------------
  {
    const rawLogger = createSkyraLogger({
      projectId: 'skyra-erp',
      serviceName: 'erp-api',
      environment: 'production',
      instanceId: 'inst-bench-03',
      level: 'info',
      transport: {
        type: 'file',
        directory: BENCH_DIR,
      },
    });

    const service = new SkyraLoggerService(rawLogger);
    const latencies: number[] = new Array(ITERATIONS);
    const memBefore = process.memoryUsage().heapUsed;
    const startBench = process.hrtime.bigint();

    for (let i = 0; i < ITERATIONS; i++) {
      const opStart = process.hrtime.bigint();
      const routeTemplate = sanitizeRouteTemplate('/api/v1/orders/:id');
      const eventContext = buildHttpCompletedEventContext({
        method: 'GET',
        statusCode: 200,
        durationMs: 8.4,
        durationNs: 8400000,
        routeTemplate,
        requestId: `req-file-${i}`,
      });

      service.info(`GET ${routeTemplate} 200 - 8.4ms`, eventContext);

      const opEnd = process.hrtime.bigint();
      latencies[i] = Number(opEnd - opStart);
    }

    await service.flush();
    const elapsedMs = Number(process.hrtime.bigint() - startBench) / 1_000_000;
    const memAfter = process.memoryUsage().heapUsed;
    const stats = calculatePercentiles(latencies);
    const status = service.getStatus();

    results.push({
      name: '5. End-to-End JSONL File Transport Under Load',
      iterations: ITERATIONS,
      totalTimeMs: Number(elapsedMs.toFixed(2)),
      opsPerSec: Math.round((ITERATIONS / elapsedMs) * 1000),
      meanLatencyUs: stats.mean,
      p50LatencyUs: stats.p50,
      p95LatencyUs: stats.p95,
      p99LatencyUs: stats.p99,
      submitted: status.totalEventsSubmitted,
      written: status.totalEventsWritten,
      dropped: status.totalEventsDropped,
      memoryDiffMb: Number(((memAfter - memBefore) / (1024 * 1024)).toFixed(2)),
    });

    await service.close();
  }

  // Print results table
  console.log('\nBenchmark Results Summary:');
  console.table(
    results.map((r) => ({
      Scenario: r.name,
      'Ops/sec': r.opsPerSec.toLocaleString(),
      'p50 (µs)': r.p50LatencyUs,
      'p95 (µs)': r.p95LatencyUs,
      'p99 (µs)': r.p99LatencyUs,
      Submitted: r.submitted,
      Written: r.written,
      Dropped: r.dropped,
      'Heap Diff (MB)': r.memoryDiffMb,
    }))
  );

  // Clean up benchmark temp dir
  if (fs.existsSync(BENCH_DIR)) {
    fs.rmSync(BENCH_DIR, { recursive: true, force: true });
  }

  console.log('='.repeat(80));
  console.log('Benchmark completed successfully.');
  console.log('='.repeat(80));
}

runBenchmarks().catch(console.error);
