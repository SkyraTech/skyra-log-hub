import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createSkyraLogger } from '../../dist/logger.js';
import { parseStrictJson } from '@skyra/logger-core';

const TEST_DIR = path.resolve('./temp-test-rotation-logs');

describe('Storage Rollover: UTC Midnight & Size-Based Rotation', () => {
  beforeEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('1. UTC midnight rollover switches segment without losing events', async () => {
    let mockDate = new Date('2026-10-21T23:59:58.000Z');

    const logger = createSkyraLogger({
      projectId: 'skyra-erp',
      serviceName: 'erp-api',
      environment: 'production',
      instanceId: 'inst-rot-01',
      transport: {
        type: 'file',
        directory: TEST_DIR,
      },
      clock: () => mockDate,
    });

    // Write on Day 1
    logger.info('Event before midnight');
    await logger.flush();

    // Cross UTC midnight
    mockDate = new Date('2026-10-22T00:00:01.000Z');

    // Write on Day 2
    logger.info('Event after midnight');
    await logger.flush();
    await logger.close();

    const instanceDir = path.join(TEST_DIR, 'skyra-erp', 'production', 'erp-api', 'inst-rot-01');
    const files = fs.readdirSync(instanceDir).filter((f) => f.endsWith('.jsonl')).sort();

    assert.deepEqual(files, ['2026-10-21.part-0000.jsonl', '2026-10-22.part-0000.jsonl']);

    // Verify record contents
    const day1Content = fs.readFileSync(path.join(instanceDir, '2026-10-21.part-0000.jsonl'), 'utf-8');
    const day1Parsed = parseStrictJson(day1Content);
    assert.equal(day1Parsed.message, 'Event before midnight');
    assert.equal(day1Parsed['@timestamp'], '2026-10-21T23:59:58.000Z');

    const day2Content = fs.readFileSync(path.join(instanceDir, '2026-10-22.part-0000.jsonl'), 'utf-8');
    const day2Parsed = parseStrictJson(day2Content);
    assert.equal(day2Parsed.message, 'Event after midnight');
    assert.equal(day2Parsed['@timestamp'], '2026-10-22T00:00:01.000Z');
  });

  it('2. Size-based rollover increments part index monotonically', async () => {
    const fixedDate = new Date('2026-10-22T12:00:00.000Z');
    // Set low limit (e.g. 500 bytes) to trigger size rollover with a few events
    const maxSizeBytes = 500;

    const logger = createSkyraLogger({
      projectId: 'skyra-erp',
      serviceName: 'erp-api',
      environment: 'production',
      instanceId: 'inst-size-01',
      transport: {
        type: 'file',
        directory: TEST_DIR,
        rotation: {
          maxFileSizeBytes: maxSizeBytes,
        },
      },
      clock: () => fixedDate,
    });

    // Write multiple events to exceed 500 bytes limit
    for (let i = 0; i < 5; i++) {
      logger.info(`Record number ${i} with substantial padding to exceed segment size limit`);
    }

    await logger.flush();
    await logger.close();

    const instanceDir = path.join(TEST_DIR, 'skyra-erp', 'production', 'erp-api', 'inst-size-01');
    const files = fs.readdirSync(instanceDir).filter((f) => f.endsWith('.jsonl')).sort();

    assert.ok(files.length >= 2, `Expected at least 2 part files due to size limit, got: ${JSON.stringify(files)}`);
    assert.ok(files.includes('2026-10-22.part-0000.jsonl'));
    assert.ok(files.includes('2026-10-22.part-0001.jsonl'));

    // Verify all parts contain complete valid JSON lines
    for (const file of files) {
      const content = fs.readFileSync(path.join(instanceDir, file), 'utf-8');
      const lines = content.trim().split('\n');
      for (const line of lines) {
        assert.doesNotThrow(() => parseStrictJson(line));
      }
    }
  });

  it('3. Combined size rollover and UTC midnight resets part to 0000 on new date', async () => {
    let mockDate = new Date('2026-10-21T10:00:00.000Z');

    const logger = createSkyraLogger({
      projectId: 'skyra-erp',
      serviceName: 'erp-api',
      environment: 'production',
      instanceId: 'inst-combined',
      transport: {
        type: 'file',
        directory: TEST_DIR,
        rotation: {
          maxFileSizeBytes: 400,
        },
      },
      clock: () => mockDate,
    });

    // Create part-0000 and part-0001 on Day 1
    logger.info('Day 1 event 1 padding padding padding padding');
    logger.info('Day 1 event 2 padding padding padding padding');
    await logger.flush();

    // Advance to next UTC date
    mockDate = new Date('2026-10-22T08:00:00.000Z');
    logger.info('Day 2 event 1');
    await logger.flush();
    await logger.close();

    const instanceDir = path.join(TEST_DIR, 'skyra-erp', 'production', 'erp-api', 'inst-combined');
    const files = fs.readdirSync(instanceDir).filter((f) => f.endsWith('.jsonl')).sort();

    assert.ok(files.includes('2026-10-21.part-0000.jsonl'));
    assert.ok(files.includes('2026-10-21.part-0001.jsonl'));
    assert.ok(files.includes('2026-10-22.part-0000.jsonl'));
  });
});
