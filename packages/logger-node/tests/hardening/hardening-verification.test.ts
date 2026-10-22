import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseStrictJson, validateLogEvent } from '@skyra/logger-core';
import {
  createSkyraLogger,
  SkyraLogger,
  InstanceOwnershipConflictError,
  recoverPartialLine,
} from '../../dist/index.js';
import { sanitizeMessage } from '../../dist/internal/limits.js';
import { isProcessAlive } from '../../dist/internal/ownership.js';
import { resetDiagnosticThrottleForTesting } from '../../dist/internal/diagnostics.js';

const TEST_DIR = path.resolve(process.cwd(), 'temp-test-hardening-logs');

describe('Hardening & Acceptance Verification (LOGHUB-PKG-002A)', () => {
  before(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  after(async () => {
    await new Promise((r) => setTimeout(r, 50));
    try {
      if (fs.existsSync(TEST_DIR)) {
        fs.rmSync(TEST_DIR, { recursive: true, force: true });
      }
    } catch {
      // Ignore directory removal locks on Windows
    }
  });

  it('Scenario 1: Concurrent normal and critical logging preserves single-writer integrity', async () => {
    const instanceId = 'inst-concurrent-harden';
    const logger = createSkyraLogger({
      projectId: 'skyra-erp',
      serviceName: 'erp-api',
      environment: 'production',
      instanceId,
      level: 'trace',
      transport: {
        type: 'file',
        directory: TEST_DIR,
      },
    });

    // Launch 300 concurrent normal and critical logs
    const writes: Promise<void>[] = [];
    for (let i = 0; i < 300; i++) {
      if (i % 3 === 0) {
        logger.error(`Error event ${i}`, { iter: i, errorType: 'FatalSim' });
      } else if (i % 5 === 0) {
        logger.fatal(`Fatal event ${i}`, { iter: i });
      } else {
        logger.info(`Info event ${i}`, { iter: i });
      }
    }

    await logger.flush();
    await logger.close();

    const instanceDir = path.join(TEST_DIR, 'skyra-erp', 'production', 'erp-api', instanceId);
    const files = fs.readdirSync(instanceDir).filter((f) => f.endsWith('.jsonl'));
    assert.ok(files.length >= 1);

    const logFile = path.join(instanceDir, files[0]!);
    const content = fs.readFileSync(logFile, 'utf-8');
    const lines = content.trim().split('\n');

    assert.equal(lines.length, 300);

    // Verify every line is strictly valid JSON without interleaving or corrupt brackets
    for (const line of lines) {
      const parsed = parseStrictJson(line) as any;
      assert.ok(parsed.message);
      assert.ok(parsed['@timestamp']);
      assert.ok(parsed.event?.id);
    }
  });

  it('Scenario 2: Saturated queue with critical event priority eviction and hard memory limit', async () => {
    let dropNotifications = 0;
    const logger = createSkyraLogger({
      projectId: 'skyra-erp',
      serviceName: 'erp-api',
      environment: 'production',
      instanceId: 'inst-saturated-harden',
      level: 'info',
      limits: {
        maxPendingEvents: 3,
        maxQueueMemoryBytes: 1024,
      },
      onDrop: () => {
        dropNotifications++;
      },
      transport: {
        type: 'stdout',
      },
    });

    // Fill queue
    logger.info('Normal log 1');
    logger.info('Normal log 2');
    logger.info('Normal log 3');

    // Saturated normal log should be dropped
    logger.info('Normal log 4');
    assert.ok(dropNotifications >= 1);

    // Critical events should evict normal logs and be accepted
    logger.error('Critical database panic');
    logger.fatal('Critical kernel OOM');

    const status = logger.getStatus();
    assert.ok(status.totalEventsAccepted >= 4);
    assert.ok(status.totalEventsDropped >= 1);

    await logger.flush();
    await logger.close();
  });

  it('Scenario 3: Multiple concurrent flush calls drain completely without race conditions', async () => {
    const logger = createSkyraLogger({
      projectId: 'skyra-erp',
      serviceName: 'erp-api',
      environment: 'production',
      instanceId: 'inst-concurrent-flush',
      transport: {
        type: 'file',
        directory: TEST_DIR,
      },
    });

    for (let i = 0; i < 50; i++) {
      logger.info(`Message ${i}`);
    }

    // Call flush concurrently 5 times
    await Promise.all([
      logger.flush(),
      logger.flush(),
      logger.flush(),
      logger.flush(),
      logger.flush(),
    ]);

    const status = logger.getStatus();
    assert.equal(status.pendingQueueCount, 0);
    assert.equal(status.totalEventsWritten, 50);

    await logger.close();
  });

  it('Scenario 4: Transport failure triggers onError and does not crash host', async () => {
    let capturedError: Error | null = null;
    const logger = createSkyraLogger({
      projectId: 'skyra-erp',
      serviceName: 'erp-api',
      environment: 'production',
      instanceId: 'inst-fail-harden',
      onError: (err) => {
        capturedError = err;
      },
      transport: {
        type: 'file',
        directory: TEST_DIR,
      },
    });

    // Force transport fd close to simulate disk I/O failure
    const transport = logger.getTransport() as any;
    if (transport.currentFd !== null) {
      fs.closeSync(transport.currentFd);
    }

    logger.info('Log against closed file descriptor');
    await logger.flush();

    // Verify onError was safely invoked
    assert.ok(capturedError !== null);
    assert.ok((capturedError as any).message.includes('EBADF'));

    // Verify logger can still close without throwing
    await logger.close();
  });

  it('Scenario 5: Quarantine metadata does NOT expose secrets by default', () => {
    const instanceDir = path.join(TEST_DIR, 'skyra-erp', 'production', 'erp-api', 'inst-quarantine-privacy');
    fs.mkdirSync(instanceDir, { recursive: true });

    const targetFile = path.join(instanceDir, '2026-10-22.part-0000.jsonl');
    const validLine = JSON.stringify({ message: 'Valid clean line', id: 'clean-1' }) + '\n';
    const secretTail = '{"message": "Auth failed with secret_password=SuperSecretPassword123! and token=Bearer eyJhbGciOi';

    fs.writeFileSync(targetFile, validLine + secretTail, 'utf-8');

    // Recover with default privacy-safe settings
    const result = recoverPartialLine(targetFile, instanceDir, '2026-10-22');
    assert.equal(result.recovered, true);

    const quarantinePath = path.join(instanceDir, '2026-10-22.corrupt.log');
    assert.ok(fs.existsSync(quarantinePath));
    const quarantineText = fs.readFileSync(quarantinePath, 'utf-8');
    const meta = JSON.parse(quarantineText.trim());

    // Invariant: Safe metadata present
    assert.equal(meta.source_file, '2026-10-22.part-0000.jsonl');
    assert.equal(meta.corruption_type, 'incomplete_trailing_line');
    assert.equal(meta.safe_error_code, 'CORRUPT_FRAGMENT_QUARANTINED');
    assert.ok(meta.sha256_hash && meta.sha256_hash.length === 64);

    // Invariant: RAW SECRETS ARE NOT EXPOSED
    assert.equal(quarantineText.includes('SuperSecretPassword123!'), false);
    assert.equal(quarantineText.includes('Bearer eyJ'), false);
    assert.equal(meta.fragment_utf8_preview, undefined);
    assert.equal(meta.fragment_base64, undefined);

    // Test explicit forensic quarantine mode
    const targetFileForensic = path.join(instanceDir, '2026-10-22.part-0001.jsonl');
    fs.writeFileSync(targetFileForensic, validLine + secretTail, 'utf-8');

    const resultForensic = recoverPartialLine(targetFileForensic, instanceDir, '2026-10-22', {
      enableForensicQuarantine: true,
    });
    assert.equal(resultForensic.recovered, true);

    const forensicLines = fs.readFileSync(quarantinePath, 'utf-8').trim().split('\n');
    assert.equal(forensicLines.length, 2);
    const forensicMeta = JSON.parse(forensicLines[1]!);
    assert.ok(forensicMeta.fragment_utf8_preview.includes('SuperSecretPassword123!'));
    assert.ok(forensicMeta.fragment_base64);
  });

  it('Scenario 6: Recovery idempotence across repeated restarts', () => {
    const instanceDir = path.join(TEST_DIR, 'skyra-erp', 'production', 'erp-api', 'inst-quarantine-idempotent');
    fs.mkdirSync(instanceDir, { recursive: true });

    const targetFile = path.join(instanceDir, '2026-10-22.part-0000.jsonl');
    const validRecord = JSON.stringify({ message: 'Persistent record' }) + '\n';
    const brokenFragment = '{"message": "Broken tail fragment';

    fs.writeFileSync(targetFile, validRecord + brokenFragment, 'utf-8');

    // First recovery: fixes corruption
    const run1 = recoverPartialLine(targetFile, instanceDir, '2026-10-22');
    assert.equal(run1.recovered, true);
    assert.equal(run1.bytesQuarantined, Buffer.byteLength(brokenFragment, 'utf-8'));

    // Second recovery: cleanly formatted file requires no recovery
    const run2 = recoverPartialLine(targetFile, instanceDir, '2026-10-22');
    assert.equal(run2.recovered, false);
    assert.equal(run2.bytesQuarantined, 0);

    const content = fs.readFileSync(targetFile, 'utf-8');
    assert.equal(content, validRecord);
  });

  it('Scenario 7: Competing writer processes rejected by atomic instance ownership', async () => {
    const instanceId = 'inst-exclusive-conflict';
    const loggerA = createSkyraLogger({
      projectId: 'skyra-erp',
      serviceName: 'erp-api',
      environment: 'production',
      instanceId,
      transport: {
        type: 'file',
        directory: TEST_DIR,
      },
    });

    // Attempting to initialize loggerB with the exact same instance directory while loggerA is active MUST fail
    assert.throws(
      () => {
        createSkyraLogger({
          projectId: 'skyra-erp',
          serviceName: 'erp-api',
          environment: 'production',
          instanceId,
          transport: {
            type: 'file',
            directory: TEST_DIR,
          },
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof InstanceOwnershipConflictError || (err as any).name === 'InstanceOwnershipConflictError');
        return true;
      }
    );

    // After closing loggerA, ownership is released
    await loggerA.close();

    // LoggerB can now acquire exclusive ownership cleanly
    const loggerB = createSkyraLogger({
      projectId: 'skyra-erp',
      serviceName: 'erp-api',
      environment: 'production',
      instanceId,
      transport: {
        type: 'file',
        directory: TEST_DIR,
      },
    });

    loggerB.info('Logger B initialized successfully after logger A release');
    await loggerB.close();
  });

  it('Scenario 8: Stale ownership lock from crashed dead PID is safely recovered', async () => {
    const instanceDir = path.join(TEST_DIR, 'skyra-erp', 'production', 'erp-api', 'inst-stale-lock');
    fs.mkdirSync(instanceDir, { recursive: true });

    const lockPath = path.join(instanceDir, '.instance.owner');
    // Write stale lock with a high non-existent PID
    const deadPid = 99999999;
    assert.equal(isProcessAlive(deadPid), false);

    fs.writeFileSync(
      lockPath,
      `pid=${deadPid}\nhostname=crashed-host\ntime=2026-01-01T00:00:00.000Z\nlockId=dead-lock-id\n`,
      'utf-8'
    );

    // Logger should detect stale lock, remove it, and initialize cleanly
    const logger = createSkyraLogger({
      projectId: 'skyra-erp',
      serviceName: 'erp-api',
      environment: 'production',
      instanceId: 'inst-stale-lock',
      transport: {
        type: 'file',
        directory: TEST_DIR,
      },
    });

    logger.info('Started cleanly despite dead PID lock');
    await logger.close();
  });

  it('Scenario 9: UTC date rollover and size rollover under concurrent log writes', async () => {
    let mockTime = new Date('2026-10-21T23:59:59.800Z');
    const instanceId = 'inst-rotation-concurrent';

    const logger = createSkyraLogger({
      projectId: 'skyra-erp',
      serviceName: 'erp-api',
      environment: 'production',
      instanceId,
      clock: () => mockTime,
      transport: {
        type: 'file',
        directory: TEST_DIR,
        rotation: {
          maxFileSizeBytes: 10 * 1024, // 10 KiB size rollover threshold for fast test
        },
      },
    });

    // Write events on 2026-10-21
    for (let i = 0; i < 30; i++) {
      logger.info(`Day 1 event ${i}`, { payload: 'X'.repeat(200) });
    }

    // Cross UTC midnight
    mockTime = new Date('2026-10-22T00:00:01.000Z');

    // Write events on 2026-10-22
    for (let i = 0; i < 40; i++) {
      logger.info(`Day 2 event ${i}`, { payload: 'Y'.repeat(200) });
    }

    await logger.flush();
    await logger.close();

    const instanceDir = path.join(TEST_DIR, 'skyra-erp', 'production', 'erp-api', instanceId);
    const files = fs.readdirSync(instanceDir).filter((f) => f.endsWith('.jsonl'));

    // Should have generated parts for both days
    assert.ok(files.some((f) => f.startsWith('2026-10-21.')));
    assert.ok(files.some((f) => f.startsWith('2026-10-22.')));

    // Verify all records across all generated parts are intact
    let totalReadLines = 0;
    for (const f of files) {
      const lines = fs.readFileSync(path.join(instanceDir, f), 'utf-8').trim().split('\n');
      for (const line of lines) {
        if (line.trim().length > 0) {
          totalReadLines++;
          const parsed = parseStrictJson(line);
          assert.ok(parsed);
        }
      }
    }
    assert.equal(totalReadLines, 70);
  });

  it('Scenario 10: Canonical schema validation after truncation & Unicode safety', async () => {
    // 10a. Oversized string with emojis
    const emojiStr = '🌍🚀'.repeat(6000); // 12,000 code units with surrogate pairs
    const truncated = sanitizeMessage(emojiStr, 8192);

    assert.ok(truncated.length <= 8192, `Expected length <= 8192, got ${truncated.length}`);
    assert.ok(truncated.endsWith('... [truncated]'));

    // Verify no lone dangling surrogates
    const lastChar = truncated.charCodeAt(truncated.length - 16);
    assert.ok(lastChar < 0xd800 || lastChar > 0xdbff, 'Must not slice high surrogate');

    // 10b. Empty string handling
    const emptySanitized = sanitizeMessage('', 8192);
    assert.equal(emptySanitized, '[empty]');

    // 10c. Canonical event with truncated message passes schema validation
    const logger = createSkyraLogger({
      projectId: 'skyra-erp',
      serviceName: 'erp-api',
      environment: 'production',
      instanceId: 'inst-schema-check',
      validationMode: 'strict', // validates every event with Ajv 2020 schema
      transport: {
        type: 'stdout',
      },
    });

    // Logging empty string must not throw FormatValidationError
    assert.doesNotThrow(() => {
      logger.info('');
    });

    // Logging 100,000 character message must not throw FormatValidationError
    assert.doesNotThrow(() => {
      logger.info('Z'.repeat(100_000));
    });

    await logger.close();
  });

  it('Scenario 10d: Oversized event exceeding maxEventSizeBytes is safely dropped', async () => {
    let dropReason = '';
    const logger = createSkyraLogger({
      projectId: 'skyra-erp',
      serviceName: 'erp-api',
      environment: 'production',
      instanceId: 'inst-oversized-event',
      limits: {
        maxEventSizeBytes: 1024, // 1 KiB limit
      },
      onDrop: (_count, reason) => {
        dropReason = reason;
      },
      transport: {
        type: 'stdout',
      },
    });

    // Huge metadata exceeding 1 KiB
    logger.info('Small message', { hugeField: 'A'.repeat(2000) });

    const status = logger.getStatus();
    assert.equal(status.totalEventsDropped, 1);
    assert.ok(dropReason.includes('exceeds maxEventSizeBytes'));

    await logger.close();
  });
});
