/**
 * Automated Contract Tests for Skyra Log Event Schema v1
 * Comprehensive regression and verification suite for LOGHUB-PKG-001B.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  validateLogEvent,
  isValidCalendarTimestamp,
  normalizeLogEvent,
  parseStrictJson,
  parseJsonl,
  DuplicateKeyError,
  auditSensitiveData,
  redactSensitiveData,
  isSensitiveKey,
  normalizeEnvironment,
  normalizeEventAction,
  REDACTED_MASK,
  LOG_EVENT_SCHEMA_V1,
} from '../../packages/logger-core/dist/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.resolve(__dirname, '../../contracts/fixtures/v1');

describe('LOGHUB-PKG-001B: Canonical Logging Schema Contract & Hardening', () => {

  it('1. Valid log events pass schema validation', () => {
    const validFixtures = [
      'valid-http-event.json',
      'valid-db-event.json',
      'valid-job-event.json',
      'valid-error-event.json',
      'valid-audit-event.json',
      'valid-python-event.json',
    ];

    for (const fixtureName of validFixtures) {
      const filePath = path.join(FIXTURES_DIR, fixtureName);
      const content = fs.readFileSync(filePath, 'utf-8');
      const event = JSON.parse(content);

      const result = validateLogEvent(event);
      assert.equal(
        result.valid,
        true,
        `Expected ${fixtureName} to be valid, but got errors: ${JSON.stringify(result.errors, null, 2)}`
      );
      assert.equal(result.errors.length, 0);
    }
  });

  it('2. Invalid timestamps and severity values are rejected with diagnostics', () => {
    // 2a. Bad timestamp
    const badTimestampPath = path.join(FIXTURES_DIR, 'invalid-bad-timestamp.json');
    const badTimestampEvent = JSON.parse(fs.readFileSync(badTimestampPath, 'utf-8'));
    const tsResult = validateLogEvent(badTimestampEvent);

    assert.equal(tsResult.valid, false, 'Expected bad timestamp to fail validation');
    assert.ok(
      tsResult.errors.some((e) => e.path.includes('@timestamp')),
      `Diagnostic error should pinpoint @timestamp path. Errors: ${JSON.stringify(tsResult.errors)}`
    );

    // 2b. Bad severity
    const badSeverityPath = path.join(FIXTURES_DIR, 'invalid-bad-severity.json');
    const badSeverityEvent = JSON.parse(fs.readFileSync(badSeverityPath, 'utf-8'));
    const sevResult = validateLogEvent(badSeverityEvent);

    assert.equal(sevResult.valid, false, 'Expected bad severity level to fail validation');
    assert.ok(
      sevResult.errors.some((e) => e.path.includes('level')),
      `Diagnostic error should pinpoint log.level path. Errors: ${JSON.stringify(sevResult.errors)}`
    );
  });

  it('3. Missing mandatory fields are rejected with detailed error paths', () => {
    const missingMandatoryPath = path.join(FIXTURES_DIR, 'invalid-missing-mandatory.json');
    const missingEvent = JSON.parse(fs.readFileSync(missingMandatoryPath, 'utf-8'));
    const result = validateLogEvent(missingEvent);

    assert.equal(result.valid, false, 'Expected missing mandatory fields to fail validation');
    const errorMessages = result.errors.map((e) => e.message.toLowerCase()).join(' ');

    assert.ok(errorMessages.includes('event'), 'Missing event must be reported');
    assert.ok(errorMessages.includes('service'), 'Missing service must be reported');
    assert.ok(errorMessages.includes('skyra'), 'Missing skyra must be reported');
  });

  it('4. Duplicate JSON property names are rejected at all depths by strict parser', () => {
    // 4a. Duplicate key in fixture
    const dupPath = path.join(FIXTURES_DIR, 'invalid-duplicate-keys.jsonl');
    const dupContent = fs.readFileSync(dupPath, 'utf-8');

    const parseResult = parseJsonl(dupContent);
    assert.equal(parseResult.records.length, 0, 'No records should be returned when lines contain duplicate keys');
    assert.ok(parseResult.errors.length > 0, 'Parser must return a duplicate key error');
    assert.ok(
      parseResult.errors[0]?.error.includes('Duplicate property'),
      `Error diagnostic must mention duplicate property: ${parseResult.errors[0]?.error}`
    );

    // 4b. Nested duplicate key
    assert.throws(
      () => parseStrictJson('{"service": {"name": "svc1", "name": "svc2"}}'),
      DuplicateKeyError,
      'parseStrictJson must throw DuplicateKeyError on nested duplicate keys'
    );

    // 4c. Duplicate key inside an array of objects
    assert.throws(
      () => parseStrictJson('{"items": [1, {"dup": 1, "dup": 2}]}'),
      DuplicateKeyError,
      'parseStrictJson must throw on duplicate keys inside arrays'
    );

    // 4d. Unicode escaped duplicate key ("a" vs "\u0061")
    assert.throws(
      () => parseStrictJson('{"a": 1, "\\u0061": 2}'),
      DuplicateKeyError,
      'parseStrictJson must detect Unicode-escaped duplicate property names'
    );
  });

  it('5. API and database timing fields have consistent units (ns vs ms)', () => {
    const validTimingEvent = {
      '@timestamp': '2026-10-21T14:32:00.000Z',
      'ecs.version': '8.11.0',
      event: {
        id: '12345678-1234-4234-8234-123456789abc',
        duration: 50000000, // 50 ms in nanoseconds
      },
      log: { level: 'info' },
      message: 'Timing check',
      service: { name: 'timing-test', environment: 'production' },
      skyra: {
        schema_version: '1.0.0',
        project_id: 'test-project',
        duration_ms: 50.0, // 50 milliseconds
      },
    };

    const validResult = validateLogEvent(validTimingEvent);
    assert.equal(validResult.valid, true, `Expected consistent units to pass: ${JSON.stringify(validResult.errors)}`);

    // Inconsistent case: duration_ms = 50.0 ms, but event.duration = 1000000000 ns (1000 ms)
    const invalidTimingEvent = {
      ...validTimingEvent,
      event: {
        id: '12345678-1234-4234-8234-123456789abc',
        duration: 1000000000,
      },
    };

    const invalidResult = validateLogEvent(invalidTimingEvent);
    assert.equal(invalidResult.valid, false, 'Expected timing unit discrepancy to fail validation');
    assert.ok(
      invalidResult.errors.some((e) => e.path === 'skyra.duration_ms'),
      'Diagnostic should identify timing discrepancy at skyra.duration_ms'
    );
  });

  it('6. Python and TypeScript sample fixtures follow the same contract', () => {
    const tsFixture = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, 'valid-http-event.json'), 'utf-8'));
    const pyFixture = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, 'valid-python-event.json'), 'utf-8'));

    const tsResult = validateLogEvent(tsFixture);
    const pyResult = validateLogEvent(pyFixture);

    assert.equal(tsResult.valid, true, 'TypeScript fixture must pass validation');
    assert.equal(pyResult.valid, true, 'Python fixture must pass validation');

    const requiredCanonicalKeys = ['@timestamp', 'ecs.version', 'event', 'log', 'message', 'service', 'skyra'];
    for (const key of requiredCanonicalKeys) {
      assert.ok(key in tsFixture, `TypeScript event missing canonical key: ${key}`);
      assert.ok(key in pyFixture, `Python event missing canonical key: ${key}`);
    }

    assert.equal(tsFixture['ecs.version'], pyFixture['ecs.version']);
  });

  it('7. Sensitive fields redaction handles compound keys, URLs, JWTs, and circular refs', () => {
    // 7a. Compound sensitive keys
    const testPayload = {
      dbPassword: 'secretPassword1',
      clientSecret: 'secretTokenXYZ',
      stripeApiKey: 'sk_live_123456',
      accessToken: 'token_abc',
      refreshToken: 'refresh_def',
      jwtToken: 'jwt_ghi',
      sessionCookie: 'sess=9988',
      connectionString: 'postgres://admin:pass123@db.prod.internal:5432/core',
      regularKey: 'benignValue',
      cacheKey: 'user:123',
      primaryKey: 'pk_456',
    };

    assert.equal(isSensitiveKey('dbPassword'), true);
    assert.equal(isSensitiveKey('clientSecret'), true);
    assert.equal(isSensitiveKey('stripeApiKey'), true);
    assert.equal(isSensitiveKey('accessToken'), true);
    assert.equal(isSensitiveKey('jwtToken'), true);
    assert.equal(isSensitiveKey('sessionCookie'), true);
    assert.equal(isSensitiveKey('connectionString'), true);
    assert.equal(isSensitiveKey('cacheKey'), false);
    assert.equal(isSensitiveKey('primaryKey'), false);
    assert.equal(isSensitiveKey('key'), false);

    const redacted = redactSensitiveData(testPayload);
    assert.equal(redacted.dbPassword, REDACTED_MASK);
    assert.equal(redacted.clientSecret, REDACTED_MASK);
    assert.equal(redacted.stripeApiKey, REDACTED_MASK);
    assert.equal(redacted.accessToken, REDACTED_MASK);
    assert.equal(redacted.refreshToken, REDACTED_MASK);
    assert.equal(redacted.jwtToken, REDACTED_MASK);
    assert.equal(redacted.sessionCookie, REDACTED_MASK);
    assert.equal(redacted.connectionString, REDACTED_MASK);
    assert.equal(redacted.regularKey, 'benignValue');
    assert.equal(redacted.cacheKey, 'user:123');
    assert.equal(redacted.primaryKey, 'pk_456');

    // 7b. Embedded URL credentials and raw JWTs
    const textSample = {
      url: 'postgres://dbadmin:SuperSecretPassword@prod-db.host:5432/analytics',
      authHeader: 'Bearer sk_live_9876543210',
      jwt: 'Token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozGz_W4mupm3_xXQe6_K5UfG_2b_1c_4d',
      query: 'https://api.skyra.io/oauth?client_id=123&token=secretValue9988&redirect_uri=https://app.skyra.io',
    };

    const sanitizedText = redactSensitiveData(textSample);
    assert.ok(sanitizedText.url.includes('postgres://dbadmin:[REDACTED]@'));
    assert.ok(sanitizedText.authHeader.includes('Bearer [REDACTED]'));
    assert.ok(!sanitizedText.jwt.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'));
    assert.ok(sanitizedText.query.includes('token=[REDACTED]'));
    assert.ok(sanitizedText.query.includes('client_id=123'));

    // 7c. Circular reference safety (must not throw RangeError)
    const circularObj: Record<string, unknown> = { name: 'circular-test' };
    circularObj.self = circularObj;

    assert.doesNotThrow(() => {
      const sanitizedCircular = redactSensitiveData(circularObj);
      assert.ok(sanitizedCircular);
    });

    // 7d. Input immutability
    const originalInput = { key: 'value', password: 'plainPassword' };
    redactSensitiveData(originalInput);
    assert.equal(originalInput.password, 'plainPassword', 'Input object must not be mutated');
  });

  it('8. Optional schema sections and unknown property constraints are strictly enforced', () => {
    const baseEvent = {
      '@timestamp': '2026-10-21T14:32:00.000Z',
      'ecs.version': '8.11.0',
      event: { id: 'a5c68e32-8438-4e4b-9725-b827568c0762' },
      log: { level: 'info' },
      message: 'Boundary testing',
      service: { name: 'test-service', environment: 'production' },
      skyra: { schema_version: '1.0.0', project_id: 'test-project' },
    };

    // 8a. Invalid HTTP status code (999 is outside 100..599)
    const badHttpEvent = {
      ...baseEvent,
      http: {
        request: { method: 'GET' },
        response: { status_code: 999 },
      },
    };
    const badHttpResult = validateLogEvent(badHttpEvent);
    assert.equal(badHttpResult.valid, false, 'Expected HTTP status code 999 to be rejected');

    // 8b. Negative duration in event
    const negDurationEvent = {
      ...baseEvent,
      event: { id: 'a5c68e32-8438-4e4b-9725-b827568c0762', duration: -50 },
    };
    const negDurationResult = validateLogEvent(negDurationEvent);
    assert.equal(negDurationResult.valid, false, 'Expected negative duration to be rejected');

    // 8c. Unknown top-level property rejected by additionalProperties: false
    const unknownPropEvent = {
      ...baseEvent,
      unexpectedField: 'forbiddenPayload',
    };
    const unknownResult = validateLogEvent(unknownPropEvent);
    assert.equal(unknownResult.valid, false, 'Expected unknown property to be rejected by schema');

    // 8d. Environment normalization
    assert.equal(normalizeEnvironment('dev'), 'development');
    assert.equal(normalizeEnvironment('qa'), 'test');
    assert.equal(normalizeEnvironment('production'), 'production');

    // 8e. Action normalization
    assert.equal(normalizeEventAction('http_request'), 'http.request.completed');
    assert.equal(normalizeEventAction('sql_query'), 'database.query.completed');
    assert.equal(normalizeEventAction('custom.action'), 'custom.action');
  });

  it('9. ECS version consistency and isolation from skyra.schema_version', () => {
    const validBase = {
      '@timestamp': '2026-10-21T14:32:00.000Z',
      'ecs.version': '8.11.0',
      event: { id: 'a5c68e32-8438-4e4b-9725-b827568c0762' },
      log: { level: 'info' },
      message: 'ECS version verification',
      service: { name: 'ecs-test-service', environment: 'production' },
      skyra: { schema_version: '1.0.0', project_id: 'test-project' },
    };

    // 9a. Pinned 8.11.0 passes
    const validResult = validateLogEvent(validBase);
    assert.equal(validResult.valid, true, `Expected ecs.version 8.11.0 to pass: ${JSON.stringify(validResult.errors)}`);

    // 9b. Non-8.11.0 ECS versions are rejected (e.g. 1.0.0, 8.10.0, 9.0.0)
    for (const badVersion of ['1.0.0', '8.10.0', '9.0.0', '8.12.0']) {
      const badEcsEvent = { ...validBase, 'ecs.version': badVersion };
      const badResult = validateLogEvent(badEcsEvent);
      assert.equal(badResult.valid, false, `Expected ecs.version ${badVersion} to be rejected`);
      assert.ok(
        badResult.errors.some((e) => e.path.includes('ecs.version')),
        `Diagnostic error should pinpoint ecs.version path for ${badVersion}`
      );
    }

    // 9c. skyra.schema_version is distinct from ecs.version
    // skyra.schema_version follows ^1\.[0-9]+(\.[0-9]+)?$
    const badSkyraVersionEvent = {
      ...validBase,
      skyra: { ...validBase.skyra, schema_version: '8.11.0' },
    };
    const badSkyraResult = validateLogEvent(badSkyraVersionEvent);
    assert.equal(badSkyraResult.valid, false, 'skyra.schema_version 8.11.0 must fail because skyra schema is v1.x');
  });

  it('10. UUIDv4 validation strictly enforces version 4 and variant bits', () => {
    const validBase = {
      '@timestamp': '2026-10-21T14:32:00.000Z',
      'ecs.version': '8.11.0',
      event: { id: 'a5c68e32-8438-4e4b-9725-b827568c0762' }, // Valid UUIDv4 (version 4, variant 9)
      log: { level: 'info' },
      message: 'UUID test',
      service: { name: 'uuid-test', environment: 'production' },
      skyra: { schema_version: '1.0.0', project_id: 'test-project' },
    };

    // 10a. Valid UUIDv4 passes
    const passResult = validateLogEvent(validBase);
    assert.equal(passResult.valid, true, 'Valid UUIDv4 must pass validation');

    // 10b. UUIDv1 rejected (version nibble is 1, not 4)
    const uuidV1Event = {
      ...validBase,
      event: { id: 'e98e217d-2b99-1d69-8a47-ef92cf856b34' },
    };
    const v1Result = validateLogEvent(uuidV1Event);
    assert.equal(v1Result.valid, false, 'UUIDv1 must be rejected by UUIDv4 schema constraint');

    // 10c. UUIDv7 rejected (version nibble is 7, not 4)
    const uuidV7Event = {
      ...validBase,
      event: { id: '018f217d-2b99-7d69-8a47-ef92cf856b34' },
    };
    const v7Result = validateLogEvent(uuidV7Event);
    assert.equal(v7Result.valid, false, 'UUIDv7 must be rejected by UUIDv4 schema constraint');

    // 10d. Invalid variant bit (e.g. 3 instead of 8, 9, a, b)
    const badVariantEvent = {
      ...validBase,
      event: { id: 'a5c68e32-8438-4e4b-3725-b827568c0762' },
    };
    const varResult = validateLogEvent(badVariantEvent);
    assert.equal(varResult.valid, false, 'Invalid RFC 4122 variant bit must be rejected');

    // 10e. Malformed non-UUID string
    const malformedEvent = {
      ...validBase,
      event: { id: 'not-a-valid-uuid-identifier' },
    };
    const malformedResult = validateLogEvent(malformedEvent);
    assert.equal(malformedResult.valid, false, 'Non-UUID identifier must be rejected');
  });

  it('11. Calendar validity and UTC boundaries for @timestamp', () => {
    const validBase = {
      'ecs.version': '8.11.0',
      event: { id: 'a5c68e32-8438-4e4b-9725-b827568c0762' },
      log: { level: 'info' },
      message: 'Timestamp verification',
      service: { name: 'ts-service', environment: 'production' },
      skyra: { schema_version: '1.0.0', project_id: 'test-project' },
    };

    // 11a. Valid UTC timestamps with ms and ns
    const validTimestamps = [
      '2026-10-21T14:32:00.123Z',
      '2026-10-21T14:32:00.123456789Z',
      '2024-02-29T12:00:00.000Z', // Valid leap day in 2024
      '2026-01-31T23:59:59.999Z', // 31-day month
      '2026-04-30T12:00:00.000Z', // 30-day month
    ];
    for (const ts of validTimestamps) {
      const res = validateLogEvent({ ...validBase, '@timestamp': ts });
      assert.equal(res.valid, true, `Expected valid timestamp ${ts} to pass: ${JSON.stringify(res.errors)}`);
    }

    // 11b. Invalid leap day in non-leap years
    for (const badLeap of ['2023-02-29T12:00:00.000Z', '2026-02-29T12:00:00.000Z', '2024-02-30T12:00:00.000Z']) {
      const res = validateLogEvent({ ...validBase, '@timestamp': badLeap });
      assert.equal(res.valid, false, `Expected invalid leap day ${badLeap} to be rejected`);
      assert.ok(res.errors.some((e) => e.path.includes('@timestamp')));
    }

    // 11c. Invalid days for 30-day months
    const badApril = validateLogEvent({ ...validBase, '@timestamp': '2026-04-31T12:00:00.000Z' });
    assert.equal(badApril.valid, false, 'April 31st must be rejected');

    // 11d. Invalid month 13
    const badMonth = validateLogEvent({ ...validBase, '@timestamp': '2026-13-01T12:00:00.000Z' });
    assert.equal(badMonth.valid, false, 'Month 13 must be rejected');

    // 11e. Invalid hours, minutes, seconds
    for (const badTime of [
      '2026-10-21T25:00:00.000Z',
      '2026-10-21T14:60:00.000Z',
      '2026-10-21T14:30:60.000Z',
    ]) {
      const res = validateLogEvent({ ...validBase, '@timestamp': badTime });
      assert.equal(res.valid, false, `Expected invalid time ${badTime} to be rejected`);
    }

    // 11f. Non-UTC timestamps (offsets or missing Z)
    for (const nonUtc of [
      '2026-10-21T14:32:00+05:30',
      '2026-10-21T14:32:00-04:00',
      '2026-10-21T14:32:00',
    ]) {
      const res = validateLogEvent({ ...validBase, '@timestamp': nonUtc });
      assert.equal(res.valid, false, `Expected non-UTC timestamp ${nonUtc} to be rejected`);
    }
  });

  it('12. Schema synchronization and safe caller immutability on normalization', () => {
    // 12a. Verify embedded schema strictly equals canonical JSON schema file
    const canonicalSchemaPath = path.resolve(__dirname, '../../contracts/schemas/v1/log-event.schema.json');
    const canonicalSchemaContent = JSON.parse(fs.readFileSync(canonicalSchemaPath, 'utf-8'));
    assert.deepEqual(
      LOG_EVENT_SCHEMA_V1,
      canonicalSchemaContent,
      'LOG_EVENT_SCHEMA_V1 in @skyra/logger-core must strictly equal canonical log-event.schema.json'
    );

    // 12b. Normalization produces schema-valid output without mutating input
    const unnormalizedInput = {
      '@timestamp': '2026-10-21T14:32:00.000Z',
      'ecs.version': '8.11.0',
      event: {
        id: 'a5c68e32-8438-4e4b-9725-b827568c0762',
        action: 'http_request', // Historical underscore action
      },
      log: { level: 'info' },
      message: 'Normalization test',
      service: {
        name: 'test-service',
        environment: 'dev', // Legacy environment alias
      },
      skyra: { schema_version: '1.0.0', project_id: 'test-project' },
    };

    // Deep freeze input to verify immutability
    const frozenInput = JSON.parse(JSON.stringify(unnormalizedInput));
    Object.freeze(frozenInput);
    Object.freeze(frozenInput.service);
    Object.freeze(frozenInput.event);

    const normalized = normalizeLogEvent(frozenInput);

    // Check caller object was not mutated
    assert.equal(frozenInput.service.environment, 'dev', 'Original environment must remain "dev"');
    assert.equal(frozenInput.event.action, 'http_request', 'Original action must remain "http_request"');

    // Check normalized output
    assert.equal(normalized.service.environment, 'development');
    assert.equal(normalized.event.action, 'http.request.completed');

    // Check normalized output passes canonical schema validation
    const valResult = validateLogEvent(normalized);
    assert.equal(valResult.valid, true, `Normalized event must pass validation: ${JSON.stringify(valResult.errors)}`);
  });

  it('13. Diagnostic privacy: secrets never leaked in validation error messages', () => {
    const secretPassword = 'SUPER_SECRET_PLAINTEXT_PASSWORD_12345';
    const secretApiKey = 'sk_live_SECRET_STRIPE_KEY_ABCDEF';

    // Submit invalid payload containing secrets in forbidden or malformed locations
    const badPayload = {
      '@timestamp': '2026-10-21T14:32:00.000Z',
      'ecs.version': '8.11.0',
      event: { id: 'a5c68e32-8438-4e4b-9725-b827568c0762' },
      log: { level: 'info' },
      message: 'Privacy check',
      service: { name: 'privacy-test', environment: 'production' },
      skyra: { schema_version: '1.0.0', project_id: 'test-project' },
      // Forbidden top-level properties containing secrets
      dbPassword: secretPassword,
      stripeApiKey: secretApiKey,
    };

    const res = validateLogEvent(badPayload);
    assert.equal(res.valid, false, 'Unknown properties must fail validation');

    // Assert that the raw secret values are NEVER printed in any diagnostic string
    const allDiagnosticText = JSON.stringify(res.errors);
    assert.ok(
      !allDiagnosticText.includes(secretPassword),
      'Diagnostic messages must never leak secret password values!'
    );
    assert.ok(
      !allDiagnosticText.includes(secretApiKey),
      'Diagnostic messages must never leak secret API key values!'
    );
  });

});

