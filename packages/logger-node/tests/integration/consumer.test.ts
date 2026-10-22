import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createSkyraLogger } from '../../dist/index.js';
import { parseStrictJson, validateLogEvent } from '@skyra/logger-core';

const CONSUMER_LOGS_DIR = path.resolve('./temp-consumer-logs');

describe('Integration: Consumer Simulation & End-to-End Validation', () => {
  beforeEach(() => {
    fs.rmSync(CONSUMER_LOGS_DIR, { recursive: true, force: true });
  });

  afterEach(() => {
    fs.rmSync(CONSUMER_LOGS_DIR, { recursive: true, force: true });
  });

  it('1. Generates physical JSONL files and verifies each line with strict parser and schema validator', async () => {
    const logger = createSkyraLogger({
      projectId: 'skyra-business-suite',
      serviceName: 'billing-service',
      environment: 'production',
      instanceId: 'pod-billing-77f9',
      serviceVersion: '1.4.2',
      level: 'debug',
      transport: {
        type: 'file',
        directory: CONSUMER_LOGS_DIR,
        rotation: {
          interval: 'utc-day',
          maxFileSizeBytes: 10 * 1024 * 1024,
        },
      },
    });

    // Write diverse representative events
    logger.info('Application bootstrap completed', {
      component: 'bootstrap',
      action: 'process.startup',
      outcome: 'success',
    });

    logger.debug('Cache checked', {
      component: 'cache',
      key: 'user:123',
      outcome: 'success',
    });

    logger.warn('Rate limit approaching', {
      component: 'gateway',
      client: { ip: '192.168.1.1', port: 8080 },
      currentRps: 950,
      maxRps: 1000,
    });

    const errorSample = new Error('Gateway timeout from upstream payment gateway');
    errorSample.name = 'UpstreamTimeoutError';
    logger.error('Payment processing failed', {
      component: 'checkout',
      error: errorSample,
      action: 'payment.charge',
      outcome: 'failure',
      durationMs: 5002.3,
      password: 'must-be-redacted',
    });

    await logger.flush();
    await logger.close();

    const expectedDir = path.join(
      CONSUMER_LOGS_DIR,
      'skyra-business-suite',
      'production',
      'billing-service',
      'pod-billing-77f9'
    );

    assert.ok(fs.existsSync(expectedDir), `Expected directory '${expectedDir}' to exist`);
    const files = fs.readdirSync(expectedDir).filter((f) => f.endsWith('.jsonl'));
    assert.equal(files.length, 1);

    const logFilePath = path.join(expectedDir, files[0]!);
    const rawContent = fs.readFileSync(logFilePath, 'utf-8');
    const lines = rawContent.trim().split('\n');

    assert.equal(lines.length, 4);

    // Verify EVERY line conforms to strict JSON (no duplicate keys) and passes canonical schema validation
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;

      // 1. Strict parser verification (lexical unique keys)
      let parsed: any;
      assert.doesNotThrow(() => {
        parsed = parseStrictJson(line);
      }, `Line ${i + 1} failed strict JSON parser`);

      // 2. Canonical schema validation
      const validation = validateLogEvent(parsed);
      assert.equal(
        validation.valid,
        true,
        `Line ${i + 1} failed canonical schema validation: ${JSON.stringify(validation.errors, null, 2)}`
      );
      assert.equal(validation.errors.length, 0);

      // 3. Verify mandatory fields
      assert.ok(parsed['@timestamp']);
      assert.equal(parsed['ecs.version'], '8.11.0');
      assert.equal(parsed.skyra.schema_version, '1.0');
      assert.equal(parsed.skyra.project_id, 'skyra-business-suite');
      assert.equal(parsed.service.name, 'billing-service');
      assert.equal(parsed.service.environment, 'production');
    }

    // Verify that the error event had its password redacted
    const errorEventParsed = parseStrictJson(lines[3]!);
    assert.equal(errorEventParsed.skyra.business?.password, '[REDACTED]');
  });
});
