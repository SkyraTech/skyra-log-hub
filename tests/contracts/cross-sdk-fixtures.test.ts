import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  validateLogEvent,
  redactSensitiveData,
  parseStrictJson,
} from '../../packages/logger-core/dist/index.js';
import { createSkyraBrowserLogger, MemoryTransport } from '../../packages/logger-browser/dist/index.js';

const FIXTURES_DIR = path.resolve('contracts/fixtures/cross-sdk');

describe('Cross-SDK Shared Fixture Compliance (LOGHUB-PKG-007)', () => {
  it('1. Validates all valid fixtures against authoritative Canonical Schema v1', () => {
    const validFiles = [
      'valid-basic-canonical.json',
      'valid-escaped-unicode.json',
      'valid-date-boundary.json',
      'valid-database-query.json',
      'valid-http-request.json',
      'valid-browser-ui-error.json',
      'valid-background-job.json',
    ];

    for (const file of validFiles) {
      const content = fs.readFileSync(path.join(FIXTURES_DIR, file), 'utf-8');
      const event = parseStrictJson(content);
      const result = validateLogEvent(event);
      const errStr = result.errors.map((e) => `${e.path}: ${e.message}`).join('; ');
      assert.equal(
        result.valid,
        true,
        `Fixture '${file}' failed validation: ${errStr}`
      );
    }
  });

  it('2. Rejects all invalid fixtures against authoritative Canonical Schema v1', () => {
    const invalidFiles = [
      'invalid-missing-mandatory.json',
      'invalid-event-action.json',
      'invalid-malformed-trace-context.json',
      'invalid-bad-severity.json',
      'invalid-unsupported-field-types.json',
    ];

    for (const file of invalidFiles) {
      const content = fs.readFileSync(path.join(FIXTURES_DIR, file), 'utf-8');
      const event = JSON.parse(content);
      const result = validateLogEvent(event);
      assert.equal(
        result.valid,
        false,
        `Fixture '${file}' unexpectedly passed validation when it should be invalid`
      );
    }
  });

  it('3. Sanitizes sensitive nested metadata matching security fixture expectations', () => {
    const content = fs.readFileSync(path.join(FIXTURES_DIR, 'security-sensitive-nested-metadata.json'), 'utf-8');
    const { unredacted_input, expected_redacted_output } = JSON.parse(content);

    const redacted = redactSensitiveData(unredacted_input);
    assert.deepEqual(redacted, expected_redacted_output);
  });

  it('4. Cross-SDK semantic parity: Browser and Schema normalization generate equivalent canonical events', async () => {
    const browserMemory = new MemoryTransport();
    const browserLogger = createSkyraBrowserLogger({
      projectId: 'skyra-parity',
      serviceName: 'cross-service',
      environment: 'production',
      level: 'info',
      transport: browserMemory,
      capture: { globalErrors: false, unhandledRejections: false, navigation: false },
    });

    browserLogger.info('Cross-SDK semantic parity test', {
      action: 'parity.verification',
      outcome: 'success',
      component: 'parity_checker',
    });
    await browserLogger.flush();

    const browserEvents = browserMemory.getEvents();
    assert.equal(browserEvents.length, 1);
    const bEv = browserEvents[0]!;

    // Validate browser event with canonical schema
    const bVal = validateLogEvent(bEv);
    const errStr = bVal.errors.map((e) => `${e.path}: ${e.message}`).join('; ');
    assert.equal(bVal.valid, true, `Browser event failed schema validation: ${errStr}`);

    // Verify canonical fields
    assert.equal(bEv['ecs.version'], '8.11.0');
    assert.equal(bEv.skyra.schema_version, '1.0');
    assert.equal(bEv.skyra.project_id, 'skyra-parity');
    assert.equal(bEv.service.name, 'cross-service');
    assert.equal(bEv.service.environment, 'production');
    assert.equal(bEv.event.action, 'parity.verification');
    assert.equal(bEv.event.outcome, 'success');
    assert.equal(bEv.skyra.component, 'parity_checker');
    assert.equal(bEv.log.level, 'info');
    assert.equal(bEv.message, 'Cross-SDK semantic parity test');
  });
});
