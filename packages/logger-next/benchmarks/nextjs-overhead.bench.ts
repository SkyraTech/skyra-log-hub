import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createNextSkyraLogger } from '../dist/logger.js';
import { withSkyraLogging } from '../dist/route-handler.js';
import { runWithRequestContext, getNextRequestContext } from '../dist/request-context.js';
import { extractTraceparent } from '../dist/internal/correlation.js';
import { sanitizeRouteTemplate } from '../dist/internal/route-sanitizer.js';
import { resetGlobalNextLogger } from '../dist/internal/singleton.js';

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
  accepted: number;
  written: number;
  dropped: number;
  memoryDiffMb: number;
  flushLatencyMs: number;
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

async function runNextBenchmarks() {
  console.log('='.repeat(80));
  console.log('SKYRA LOGHUB — @skyra/logger-next Performance & Overhead Benchmark');
  console.log(`OS: ${os.type()} ${os.release()} (${os.arch()}) | CPU: ${os.cpus()[0]?.model} (${os.cpus().length} cores)`);
  console.log(`Node.js: ${process.version} | V8: ${process.versions.v8} | Next.js: 15.5.28 | Memory: ${Math.round(os.totalmem() / (1024 * 1024 * 1024))} GB`);
  console.log('='.repeat(80));

  const results: BenchmarkResult[] = [];
  const BENCH_DIR = path.resolve(process.cwd(), 'temp-bench-nextjs-logs');
  if (fs.existsSync(BENCH_DIR)) {
    fs.rmSync(BENCH_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(BENCH_DIR, { recursive: true });

  const ITERATIONS = 10_000;

  // -------------------------------------------------------------
  // Scenario 1: Baseline Next.js Route Handler (No Logging)
  // -------------------------------------------------------------
  {
    const rawHandler = async (req: Request) => {
      const _data = { status: 'ok', query: req.url };
      return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
    };

    const latencies: number[] = new Array(ITERATIONS);
    const memBefore = process.memoryUsage().heapUsed;
    const startBench = process.hrtime.bigint();

    for (let i = 0; i < ITERATIONS; i++) {
      const req = new Request('http://localhost:3000/api/users/123?page=1');
      const opStart = process.hrtime.bigint();
      await rawHandler(req);
      const opEnd = process.hrtime.bigint();
      latencies[i] = Number(opEnd - opStart);
    }

    const totalTimeMs = Number(process.hrtime.bigint() - startBench) / 1_000_000;
    const memAfter = process.memoryUsage().heapUsed;
    const pct = calculatePercentiles(latencies);

    results.push({
      name: '1. Baseline Next.js Route Handler (Uninstrumented)',
      iterations: ITERATIONS,
      totalTimeMs: Number(totalTimeMs.toFixed(2)),
      opsPerSec: Math.round((ITERATIONS / totalTimeMs) * 1_000),
      meanLatencyUs: pct.mean,
      p50LatencyUs: pct.p50,
      p95LatencyUs: pct.p95,
      p99LatencyUs: pct.p99,
      submitted: 0,
      accepted: 0,
      written: 0,
      dropped: 0,
      memoryDiffMb: Number(((memAfter - memBefore) / (1024 * 1024)).toFixed(2)),
      flushLatencyMs: 0,
    });
  }

  // -------------------------------------------------------------
  // Scenario 2: Correlation-Enabled Route Handler (ALS + W3C Traceparent)
  // -------------------------------------------------------------
  {
    const correlationHandler = async (req: Request) => {
      const trace = extractTraceparent(req.headers.get('traceparent'));
      return runWithRequestContext(
        {
          requestId: 'bench-req-123',
          traceId: trace?.traceId || '4bf92f3577b34da6a3ce929d0e0e4736',
          spanId: trace?.spanId || '00f067aa0ba902b7',
          startTimeNs: process.hrtime.bigint(),
        },
        async () => {
          const _ctx = getNextRequestContext();
          return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
        }
      );
    };

    const latencies: number[] = new Array(ITERATIONS);
    const memBefore = process.memoryUsage().heapUsed;
    const startBench = process.hrtime.bigint();

    for (let i = 0; i < ITERATIONS; i++) {
      const req = new Request('http://localhost:3000/api/users/123', {
        headers: { traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01' },
      });
      const opStart = process.hrtime.bigint();
      await correlationHandler(req);
      const opEnd = process.hrtime.bigint();
      latencies[i] = Number(opEnd - opStart);
    }

    const totalTimeMs = Number(process.hrtime.bigint() - startBench) / 1_000_000;
    const memAfter = process.memoryUsage().heapUsed;
    const pct = calculatePercentiles(latencies);

    results.push({
      name: '2. Correlation-Only Next.js Route Handler (ALS + W3C)',
      iterations: ITERATIONS,
      totalTimeMs: Number(totalTimeMs.toFixed(2)),
      opsPerSec: Math.round((ITERATIONS / totalTimeMs) * 1_000),
      meanLatencyUs: pct.mean,
      p50LatencyUs: pct.p50,
      p95LatencyUs: pct.p95,
      p99LatencyUs: pct.p99,
      submitted: 0,
      accepted: 0,
      written: 0,
      dropped: 0,
      memoryDiffMb: Number(((memAfter - memBefore) / (1024 * 1024)).toFixed(2)),
      flushLatencyMs: 0,
    });
  }

  // -------------------------------------------------------------
  // Scenario 3: Full withSkyraLogging Route Handler (File Transport)
  // -------------------------------------------------------------
  {
    resetGlobalNextLogger();
    const logger = createNextSkyraLogger({
      projectId: 'bench-next-proj',
      serviceName: 'bench-next-srv',
      environment: 'test',
      instanceId: 'inst-bench-01',
      level: 'info',
      transport: {
        type: 'file',
        directory: path.join(BENCH_DIR, 'file-transport'),
      },
    });

    const loggedHandler = withSkyraLogging(
      async (req: Request) => {
        return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
      },
      { route: '/api/users/[userId]', logger }
    );

    const latencies: number[] = new Array(ITERATIONS);
    const memBefore = process.memoryUsage().heapUsed;
    const startBench = process.hrtime.bigint();

    for (let i = 0; i < ITERATIONS; i++) {
      const req = new Request('http://localhost:3000/api/users/123', {
        headers: {
          traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
          'x-request-id': `bench-req-${i}`,
        },
      });
      const opStart = process.hrtime.bigint();
      await loggedHandler(req);
      const opEnd = process.hrtime.bigint();
      latencies[i] = Number(opEnd - opStart);
    }

    const totalTimeMs = Number(process.hrtime.bigint() - startBench) / 1_000_000;

    // Flush and measure flush latency
    const flushStart = process.hrtime.bigint();
    await logger.flush();
    const flushLatencyMs = Number(process.hrtime.bigint() - flushStart) / 1_000_000;

    const memAfter = process.memoryUsage().heapUsed;
    const pct = calculatePercentiles(latencies);
    const status = logger.getStatus();

    results.push({
      name: '3. withSkyraLogging Route Handler (JSONL File Transport)',
      iterations: ITERATIONS,
      totalTimeMs: Number(totalTimeMs.toFixed(2)),
      opsPerSec: Math.round((ITERATIONS / totalTimeMs) * 1_000),
      meanLatencyUs: pct.mean,
      p50LatencyUs: pct.p50,
      p95LatencyUs: pct.p95,
      p99LatencyUs: pct.p99,
      submitted: status.totalEventsSubmitted,
      accepted: status.totalEventsAccepted,
      written: status.totalEventsWritten,
      dropped: status.totalEventsDropped,
      memoryDiffMb: Number(((memAfter - memBefore) / (1024 * 1024)).toFixed(2)),
      flushLatencyMs: Number(flushLatencyMs.toFixed(2)),
    });

    await logger.close();
  }

  // -------------------------------------------------------------
  // Scenario 4: Error-Logging Route Handler (Unhandled Exception)
  // -------------------------------------------------------------
  {
    resetGlobalNextLogger();
    const logger = createNextSkyraLogger({
      projectId: 'bench-next-proj',
      serviceName: 'bench-next-srv',
      environment: 'test',
      instanceId: 'inst-bench-err',
      level: 'info',
      transport: {
        type: 'file',
        directory: path.join(BENCH_DIR, 'file-error-transport'),
      },
    });

    const errorLoggedHandler = withSkyraLogging(
      async (_req: Request) => {
        throw new Error('Simulated Route Failure with Stack Trace');
      },
      { route: '/api/fail', logger }
    );

    const latencies: number[] = new Array(ITERATIONS);
    const memBefore = process.memoryUsage().heapUsed;
    const startBench = process.hrtime.bigint();

    for (let i = 0; i < ITERATIONS; i++) {
      const req = new Request('http://localhost:3000/api/fail');
      const opStart = process.hrtime.bigint();
      try {
        await errorLoggedHandler(req);
      } catch {
        // Expected rethrown exception
      }
      const opEnd = process.hrtime.bigint();
      latencies[i] = Number(opEnd - opStart);
    }

    const totalTimeMs = Number(process.hrtime.bigint() - startBench) / 1_000_000;

    const flushStart = process.hrtime.bigint();
    await logger.flush();
    const flushLatencyMs = Number(process.hrtime.bigint() - flushStart) / 1_000_000;

    const memAfter = process.memoryUsage().heapUsed;
    const pct = calculatePercentiles(latencies);
    const status = logger.getStatus();

    results.push({
      name: '4. Error-Logging Route Handler (Exception Serialization)',
      iterations: ITERATIONS,
      totalTimeMs: Number(totalTimeMs.toFixed(2)),
      opsPerSec: Math.round((ITERATIONS / totalTimeMs) * 1_000),
      meanLatencyUs: pct.mean,
      p50LatencyUs: pct.p50,
      p95LatencyUs: pct.p95,
      p99LatencyUs: pct.p99,
      submitted: status.totalEventsSubmitted,
      accepted: status.totalEventsAccepted,
      written: status.totalEventsWritten,
      dropped: status.totalEventsDropped,
      memoryDiffMb: Number(((memAfter - memBefore) / (1024 * 1024)).toFixed(2)),
      flushLatencyMs: Number(flushLatencyMs.toFixed(2)),
    });

    await logger.close();
  }

  // -------------------------------------------------------------
  // Scenario 5: High-Concurrency Burst Route Handler (Concurrency = 50)
  // -------------------------------------------------------------
  {
    resetGlobalNextLogger();
    const logger = createNextSkyraLogger({
      projectId: 'bench-next-proj',
      serviceName: 'bench-next-srv',
      environment: 'test',
      instanceId: 'inst-bench-conc',
      level: 'info',
      transport: {
        type: 'file',
        directory: path.join(BENCH_DIR, 'file-conc-transport'),
      },
    });

    const loggedHandler = withSkyraLogging(
      async (req: Request) => {
        return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
      },
      { route: '/api/concurrent', logger }
    );

    const BATCH_SIZE = 50;
    const BATCHES = ITERATIONS / BATCH_SIZE;
    const latencies: number[] = [];
    const memBefore = process.memoryUsage().heapUsed;
    const startBench = process.hrtime.bigint();

    for (let b = 0; b < BATCHES; b++) {
      const batchPromises = Array.from({ length: BATCH_SIZE }, async (_, i) => {
        const req = new Request('http://localhost:3000/api/concurrent', {
          headers: {
            traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
            'x-request-id': `bench-conc-${b}-${i}`,
          },
        });
        const opStart = process.hrtime.bigint();
        await loggedHandler(req);
        const opEnd = process.hrtime.bigint();
        return Number(opEnd - opStart);
      });

      const batchLatencies = await Promise.all(batchPromises);
      latencies.push(...batchLatencies);
    }

    const totalTimeMs = Number(process.hrtime.bigint() - startBench) / 1_000_000;

    const flushStart = process.hrtime.bigint();
    await logger.flush();
    const flushLatencyMs = Number(process.hrtime.bigint() - flushStart) / 1_000_000;

    const memAfter = process.memoryUsage().heapUsed;
    const pct = calculatePercentiles(latencies);
    const status = logger.getStatus();

    results.push({
      name: '5. High-Concurrency Route Handler (50 Concurrent Burst)',
      iterations: ITERATIONS,
      totalTimeMs: Number(totalTimeMs.toFixed(2)),
      opsPerSec: Math.round((ITERATIONS / totalTimeMs) * 1_000),
      meanLatencyUs: pct.mean,
      p50LatencyUs: pct.p50,
      p95LatencyUs: pct.p95,
      p99LatencyUs: pct.p99,
      submitted: status.totalEventsSubmitted,
      accepted: status.totalEventsAccepted,
      written: status.totalEventsWritten,
      dropped: status.totalEventsDropped,
      memoryDiffMb: Number(((memAfter - memBefore) / (1024 * 1024)).toFixed(2)),
      flushLatencyMs: Number(flushLatencyMs.toFixed(2)),
    });

    await logger.close();
  }

  // -------------------------------------------------------------
  // Scenario 6: Stdout Transport Comparison
  // -------------------------------------------------------------
  {
    resetGlobalNextLogger();
    // Temporarily redirect process.stdout.write to a noop sink for pure serialization benchmarking
    const originalWrite = process.stdout.write;
    process.stdout.write = (() => true) as any;

    const logger = createNextSkyraLogger({
      projectId: 'bench-next-proj',
      serviceName: 'bench-next-srv',
      environment: 'test',
      instanceId: 'inst-bench-stdout',
      level: 'info',
      transport: { type: 'stdout' },
    });

    const loggedHandler = withSkyraLogging(
      async (req: Request) => {
        return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
      },
      { route: '/api/stdout', logger }
    );

    const latencies: number[] = new Array(ITERATIONS);
    const memBefore = process.memoryUsage().heapUsed;
    const startBench = process.hrtime.bigint();

    for (let i = 0; i < ITERATIONS; i++) {
      const req = new Request('http://localhost:3000/api/stdout');
      const opStart = process.hrtime.bigint();
      await loggedHandler(req);
      const opEnd = process.hrtime.bigint();
      latencies[i] = Number(opEnd - opStart);
    }

    const totalTimeMs = Number(process.hrtime.bigint() - startBench) / 1_000_000;

    const flushStart = process.hrtime.bigint();
    await logger.flush();
    const flushLatencyMs = Number(process.hrtime.bigint() - flushStart) / 1_000_000;

    // Restore stdout
    process.stdout.write = originalWrite;

    const memAfter = process.memoryUsage().heapUsed;
    const pct = calculatePercentiles(latencies);
    const status = logger.getStatus();

    results.push({
      name: '6. withSkyraLogging Route Handler (Stdout Transport)',
      iterations: ITERATIONS,
      totalTimeMs: Number(totalTimeMs.toFixed(2)),
      opsPerSec: Math.round((ITERATIONS / totalTimeMs) * 1_000),
      meanLatencyUs: pct.mean,
      p50LatencyUs: pct.p50,
      p95LatencyUs: pct.p95,
      p99LatencyUs: pct.p99,
      submitted: status.totalEventsSubmitted,
      accepted: status.totalEventsAccepted,
      written: status.totalEventsWritten,
      dropped: status.totalEventsDropped,
      memoryDiffMb: Number(((memAfter - memBefore) / (1024 * 1024)).toFixed(2)),
      flushLatencyMs: Number(flushLatencyMs.toFixed(2)),
    });

    await logger.close();
  }

  // Clean up benchmark logs
  try {
    fs.rmSync(BENCH_DIR, { recursive: true, force: true });
  } catch {}

  // -------------------------------------------------------------
  // Print Formatted Benchmark Results Table
  // -------------------------------------------------------------
  console.log('\nBENCHMARK RESULTS (10,000 iterations per scenario):');
  console.log('-'.repeat(125));
  console.log(
    'Scenario'.padEnd(52) +
      'Ops/sec'.padStart(12) +
      'Mean (µs)'.padStart(12) +
      'p50 (µs)'.padStart(10) +
      'p95 (µs)'.padStart(10) +
      'p99 (µs)'.padStart(10) +
      'Events'.padStart(10) +
      'Flush(ms)'.padStart(9)
  );
  console.log('-'.repeat(125));

  for (const r of results) {
    console.log(
      r.name.padEnd(52) +
        String(r.opsPerSec.toLocaleString()).padStart(12) +
        String(r.meanLatencyUs.toFixed(1)).padStart(12) +
        String(r.p50LatencyUs.toFixed(1)).padStart(10) +
        String(r.p95LatencyUs.toFixed(1)).padStart(10) +
        String(r.p99LatencyUs.toFixed(1)).padStart(10) +
        String(`${r.written}/${r.submitted}`).padStart(10) +
        String(r.flushLatencyMs.toFixed(1)).padStart(9)
    );
  }
  console.log('-'.repeat(125));

  // Compute overhead compared to baseline
  const baseline = results[0];
  const fileLogged = results[2];
  if (baseline && fileLogged) {
    const overheadUs = fileLogged.meanLatencyUs - baseline.meanLatencyUs;
    const overheadPct = ((fileLogged.meanLatencyUs - baseline.meanLatencyUs) / baseline.meanLatencyUs) * 100;
    console.log(`\nLogging Overhead Summary:`);
    console.log(`• Baseline Mean Latency:           ${baseline.meanLatencyUs} µs`);
    console.log(`• Full withSkyraLogging Mean:      ${fileLogged.meanLatencyUs} µs`);
    console.log(`• Direct Logging Overhead:         ${overheadUs.toFixed(2)} µs per HTTP request`);
    console.log(`• Relative Handler Overhead:       +${overheadPct.toFixed(1)}%`);
    console.log(`• Events Accepted / Written:       ${fileLogged.accepted} / ${fileLogged.written} (100% completion)`);
    console.log(`• Events Dropped:                  ${fileLogged.dropped} (0 drops under normal load)`);
    console.log(`• Max Flush Latency:               ${fileLogged.flushLatencyMs} ms`);
  }
  console.log('='.repeat(80));
}

runNextBenchmarks().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
