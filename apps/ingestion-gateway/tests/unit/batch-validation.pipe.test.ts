import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import { BatchValidationPipe } from '../../src/ingestion/pipes/batch-validation.pipe.js';
import { GatewayConfigService } from '../../src/config/config.service.js';
import { GatewayException } from '../../src/common/types/gateway-exception.js';
import { ErrorCode } from '../../src/common/types/error-code.enum.js';
import { createValidLogEvent } from '../fixtures/valid-event.fixture.js';

describe('BatchValidationPipe Unit Tests', () => {
  const config = new GatewayConfigService({ MAX_BATCH_SIZE: '10' });
  const pipe = new BatchValidationPipe(config);

  it('should accept a valid versioned batch envelope', () => {
    const batchId = crypto.randomUUID();
    const event1 = createValidLogEvent();
    const event2 = createValidLogEvent();

    const result = pipe.transform({
      protocol_version: '1.0',
      batch_id: batchId,
      sent_at: '2026-10-24T00:00:00.000Z',
      events: [event1, event2],
    });

    assert.equal(result.protocol_version, '1.0');
    assert.equal(result.batch_id, batchId);
    assert.equal(result.isLegacyEnvelope, false);
    assert.equal(result.events.length, 2);
    assert.ok(result.contentDigestSha256.length === 64);
  });

  it('should accept a valid legacy browser SDK batch envelope', () => {
    const event1 = createValidLogEvent();
    const event2 = createValidLogEvent();

    const result = pipe.transform({
      sent_at: '2026-10-24T00:00:00.000Z',
      batch_size: 2,
      events: [event1, event2],
    });

    assert.equal(result.protocol_version, '1.0');
    assert.ok(result.batch_id.length > 0);
    assert.equal(result.isLegacyEnvelope, true);
    assert.equal(result.events.length, 2);
  });

  it('should reject unsupported protocol version', () => {
    assert.throws(
      () =>
        pipe.transform({
          protocol_version: '2.0',
          sent_at: '2026-10-24T00:00:00.000Z',
          events: [createValidLogEvent()],
        }),
      (err: any) => {
        assert.ok(err instanceof GatewayException);
        assert.equal(err.code, ErrorCode.UNSUPPORTED_PROTOCOL_VERSION);
        return true;
      },
    );
  });

  it('should reject empty events array with BATCH_EMPTY', () => {
    assert.throws(
      () =>
        pipe.transform({
          protocol_version: '1.0',
          sent_at: '2026-10-24T00:00:00.000Z',
          events: [],
        }),
      (err: any) => {
        assert.ok(err instanceof GatewayException);
        assert.equal(err.code, ErrorCode.BATCH_EMPTY);
        return true;
      },
    );
  });

  it('should reject oversized batch with BATCH_OVERSIZED', () => {
    const events = Array.from({ length: 11 }, () => createValidLogEvent());
    assert.throws(
      () =>
        pipe.transform({
          protocol_version: '1.0',
          sent_at: '2026-10-24T00:00:00.000Z',
          events,
        }),
      (err: any) => {
        assert.ok(err instanceof GatewayException);
        assert.equal(err.code, ErrorCode.BATCH_OVERSIZED);
        return true;
      },
    );
  });

  it('should reject duplicate event IDs within the same batch', () => {
    const duplicateId = crypto.randomUUID();
    const event1 = createValidLogEvent({ eventId: duplicateId });
    const event2 = createValidLogEvent({ eventId: duplicateId });

    assert.throws(
      () =>
        pipe.transform({
          protocol_version: '1.0',
          sent_at: '2026-10-24T00:00:00.000Z',
          events: [event1, event2],
        }),
      (err: any) => {
        assert.ok(err instanceof GatewayException);
        assert.equal(err.code, ErrorCode.SCHEMA_VALIDATION_FAILED);
        assert.match(err.message, /Duplicate event ID/i);
        return true;
      },
    );
  });

  it('should reject invalid event schema (atomic whole-batch rejection)', () => {
    const validEvent = createValidLogEvent();
    const invalidEvent = {
      message: 'missing almost all required fields',
    };

    assert.throws(
      () =>
        pipe.transform({
          protocol_version: '1.0',
          sent_at: '2026-10-24T00:00:00.000Z',
          events: [validEvent, invalidEvent],
        }),
      (err: any) => {
        assert.ok(err instanceof GatewayException);
        assert.equal(err.code, ErrorCode.SCHEMA_VALIDATION_FAILED);
        assert.ok(err.details?.length > 0);
        return true;
      },
    );
  });
});
