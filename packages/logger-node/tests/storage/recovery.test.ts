import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createSkyraLogger } from '../../dist/logger.js';
import { recoverPartialLine } from '../../dist/internal/recovery.js';
import { parseStrictJson } from '@skyra/logger-core';

const TEST_DIR = path.resolve('./temp-test-recovery-logs');

describe('Storage Recovery: Partial-Line Recovery & Clean Restart', () => {
  beforeEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('1. Detects and quarantines incomplete trailing line on restart', () => {
    const instanceDir = path.join(TEST_DIR, 'skyra-erp', 'production', 'erp-api', 'inst-rec');
    fs.mkdirSync(instanceDir, { recursive: true });

    const logFile = path.join(instanceDir, '2026-10-22.part-0000.jsonl');
    const validLine1 = JSON.stringify({ message: 'Valid complete record 1', id: '1' }) + '\n';
    const validLine2 = JSON.stringify({ message: 'Valid complete record 2', id: '2' }) + '\n';
    const corruptedTail = '{"message": "Incomplete cut-off record in the mi'; // Notice missing closing bracket and missing \n!

    fs.writeFileSync(logFile, validLine1 + validLine2 + corruptedTail, 'utf-8');

    // Run recovery
    const recovery = recoverPartialLine(logFile, instanceDir, '2026-10-22');

    assert.equal(recovery.recovered, true);
    assert.equal(recovery.bytesQuarantined, Buffer.byteLength(corruptedTail, 'utf-8'));
    assert.equal(recovery.finalSizeBytes, Buffer.byteLength(validLine1 + validLine2, 'utf-8'));

    // Verify .jsonl file content after truncation
    const restoredContent = fs.readFileSync(logFile, 'utf-8');
    assert.equal(restoredContent, validLine1 + validLine2);

    // Verify quarantine log was created with privacy-safe metadata (no secrets/raw text by default)
    const quarantinePath = path.join(instanceDir, '2026-10-22.corrupt.log');
    assert.ok(fs.existsSync(quarantinePath));
    const quarantineContent = fs.readFileSync(quarantinePath, 'utf-8');
    const parsed = JSON.parse(quarantineContent.trim());
    assert.equal(parsed.source_file, '2026-10-22.part-0000.jsonl');
    assert.equal(parsed.corrupt_bytes_count, Buffer.byteLength(corruptedTail, 'utf-8'));
    assert.equal(parsed.corruption_type, 'incomplete_trailing_line');
    assert.ok(parsed.sha256_hash && parsed.sha256_hash.length === 64);
    assert.equal(parsed.safe_error_code, 'CORRUPT_FRAGMENT_QUARANTINED');
    // Ensure raw plaintext is NOT leaked by default
    assert.equal(parsed.fragment_utf8_preview, undefined);
    assert.equal(parsed.fragment_base64, undefined);
  });

  it('2. Resumes writing safely after recovering from partial line corruption', async () => {
    const fixedDate = new Date('2026-10-22T10:00:00.000Z');
    const instanceDir = path.join(TEST_DIR, 'skyra-erp', 'production', 'erp-api', 'inst-resume');
    fs.mkdirSync(instanceDir, { recursive: true });

    const logFile = path.join(instanceDir, '2026-10-22.part-0000.jsonl');
    const validLine = JSON.stringify({ message: 'Prior valid line', level: 'info' }) + '\n';
    const brokenLine = '{"message": "Power cut off while writ'; // corrupted fragment

    fs.writeFileSync(logFile, validLine + brokenLine, 'utf-8');

    // Initialize logger on top of corrupted directory
    const logger = createSkyraLogger({
      projectId: 'skyra-erp',
      serviceName: 'erp-api',
      environment: 'production',
      instanceId: 'inst-resume',
      transport: {
        type: 'file',
        directory: TEST_DIR,
      },
      clock: () => fixedDate,
    });

    // Write a new record
    logger.info('New record after recovery');
    await logger.flush();
    await logger.close();

    // Verify file lines: each line must be valid strict JSON!
    const finalContent = fs.readFileSync(logFile, 'utf-8');
    const lines = finalContent.trim().split('\n');

    assert.equal(lines.length, 2);
    const parsed1 = parseStrictJson(lines[0]!);
    assert.equal(parsed1.message, 'Prior valid line');

    const parsed2 = parseStrictJson(lines[1]!);
    assert.equal(parsed2.message, 'New record after recovery');
  });

  it('3. Reopening directory resumes highest existing part file', async () => {
    const fixedDate = new Date('2026-10-22T10:00:00.000Z');
    const instanceDir = path.join(TEST_DIR, 'skyra-erp', 'production', 'erp-api', 'inst-parts');
    fs.mkdirSync(instanceDir, { recursive: true });

    // Seed existing part-0000 and part-0001
    fs.writeFileSync(path.join(instanceDir, '2026-10-22.part-0000.jsonl'), '{"old":"part0"}\n', 'utf-8');
    fs.writeFileSync(path.join(instanceDir, '2026-10-22.part-0001.jsonl'), '{"old":"part1"}\n', 'utf-8');

    const logger = createSkyraLogger({
      projectId: 'skyra-erp',
      serviceName: 'erp-api',
      environment: 'production',
      instanceId: 'inst-parts',
      transport: {
        type: 'file',
        directory: TEST_DIR,
      },
      clock: () => fixedDate,
    });

    logger.info('Message into resumed part');
    await logger.flush();
    await logger.close();

    // Part-0001 must contain the new message
    const part1Content = fs.readFileSync(path.join(instanceDir, '2026-10-22.part-0001.jsonl'), 'utf-8');
    assert.ok(part1Content.includes('Message into resumed part'));

    // Part-0000 should remain untouched
    const part0Content = fs.readFileSync(path.join(instanceDir, '2026-10-22.part-0000.jsonl'), 'utf-8');
    assert.equal(part0Content, '{"old":"part0"}\n');
  });
});
