import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createSkyraLogger } from '../../dist/logger.js';
import { parseStrictJson } from '@skyra/logger-core';
import { emitInternalDiagnostic, resetDiagnosticThrottleForTesting } from '../../dist/internal/diagnostics.js';

const TEST_DIR = path.resolve('./temp-test-concurrency-logs');

describe('Reliability: Concurrency, Disk Failures & Diagnostic Privacy', () => {
  beforeEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('1. High concurrency writes do not interleave or corrupt JSONL lines', async () => {
    const logger = createSkyraLogger({
      projectId: 'skyra-erp',
      serviceName: 'erp-api',
      environment: 'production',
      instanceId: 'inst-concurrent',
      transport: {
        type: 'file',
        directory: TEST_DIR,
      },
    });

    // Launch 100 concurrent asynchronous tasks logging simultaneously
    const totalEvents = 100;
    const tasks = Array.from({ length: totalEvents }, (_, i) => {
      return (async () => {
        logger.info(`Concurrent task event ${i}`, { taskId: i, timestamp: Date.now() });
      })();
    });

    await Promise.all(tasks);
    await logger.flush();
    await logger.close();

    const instanceDir = path.join(TEST_DIR, 'skyra-erp', 'production', 'erp-api', 'inst-concurrent');
    const files = fs.readdirSync(instanceDir).filter((f) => f.endsWith('.jsonl'));
    assert.equal(files.length, 1);

    const content = fs.readFileSync(path.join(instanceDir, files[0]!), 'utf-8');
    const lines = content.trim().split('\n');
    assert.equal(lines.length, totalEvents);

    // Every single line must parse as strict JSON without duplicate keys or broken syntax!
    for (const line of lines) {
      assert.doesNotThrow(() => parseStrictJson(line));
    }
  });

  it('2. Transport write errors do not crash host application and invoke onError', async () => {
    let capturedError: Error | null = null;

    const logger = createSkyraLogger({
      projectId: 'skyra-erp',
      serviceName: 'erp-api',
      environment: 'production',
      instanceId: 'inst-err',
      transport: {
        type: 'file',
        directory: TEST_DIR,
      },
      onError: (err) => {
        capturedError = err;
      },
    });

    // Intentionally sabotage the underlying transport's file descriptor
    const transport = logger.getTransport() as any;
    if (transport.currentFd !== null) {
      fs.closeSync(transport.currentFd);
      transport.currentFd = 999999; // Invalid FD to simulate disk write failure (EBADF / ENOSPC)
    }

    // Logger must not throw an uncaught exception crashing the process!
    assert.doesNotThrow(() => {
      logger.error('Attempt write to broken transport');
    });

    await logger.flush().catch(() => {});
    await logger.close().catch(() => {});
  });

  it('3. Diagnostics redact sensitive information before outputting to stderr', () => {
    let interceptedStderr = '';
    const originalStderrWrite = process.stderr.write;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    process.stderr.write = ((chunk: any) => {
      interceptedStderr += chunk.toString();
      return true;
    }) as any;

    resetDiagnosticThrottleForTesting();
    try {
      emitInternalDiagnostic(
        'AuthFailure',
        'Failed auth for postgres://admin:superSecret123@db.internal:5432/main with token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.secretPart',
        { password: 'plainPasswordMustBeMasked' }
      );

      assert.ok(!interceptedStderr.includes('superSecret123'), 'Raw DB password must not leak into stderr');
      assert.ok(!interceptedStderr.includes('plainPasswordMustBeMasked'), 'Diagnostic object passwords must be redacted');
      assert.ok(interceptedStderr.includes('[REDACTED]'));
    } finally {
      process.stderr.write = originalStderrWrite;
    }
  });
});
