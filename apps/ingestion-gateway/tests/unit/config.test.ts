import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { GatewayConfigService } from '../../src/config/config.service.js';

describe('GatewayConfigService Unit Tests', () => {
  it('should load valid default configuration', () => {
    const config = new GatewayConfigService({});
    assert.equal(config.nodeEnv, 'development');
    assert.equal(config.host, '0.0.0.0');
    assert.equal(config.port, 4000);
    assert.equal(config.maxBatchSize, 500);
    assert.equal(config.maxPayloadBytes, 5242880);
    assert.equal(config.defaultRateLimitPerMin, 600);
    assert.equal(config.burstRateLimitPerMin, 1200);
    assert.equal(config.durabilityBackendEnabled, false);
  });

  it('should reject invalid NODE_ENV', () => {
    assert.throws(
      () => new GatewayConfigService({ NODE_ENV: 'invalid_env' }),
      /Invalid NODE_ENV/,
    );
  });

  it('should reject invalid PORT', () => {
    assert.throws(
      () => new GatewayConfigService({ PORT: '99999' }),
      /Invalid PORT/,
    );
    assert.throws(
      () => new GatewayConfigService({ PORT: 'not_a_number' }),
      /Invalid PORT/,
    );
  });

  it('should reject invalid MAX_BATCH_SIZE', () => {
    assert.throws(
      () => new GatewayConfigService({ MAX_BATCH_SIZE: '0' }),
      /Invalid MAX_BATCH_SIZE/,
    );
    assert.throws(
      () => new GatewayConfigService({ MAX_BATCH_SIZE: '10000' }),
      /Invalid MAX_BATCH_SIZE/,
    );
  });

  it('should reject invalid MAX_PAYLOAD_BYTES', () => {
    assert.throws(
      () => new GatewayConfigService({ MAX_PAYLOAD_BYTES: '500' }),
      /Invalid MAX_PAYLOAD_BYTES/,
    );
  });

  it('should reject BURST_RATE_LIMIT_PER_MINUTE lower than default', () => {
    assert.throws(
      () =>
        new GatewayConfigService({
          DEFAULT_RATE_LIMIT_PER_MINUTE: '600',
          BURST_RATE_LIMIT_PER_MINUTE: '300',
        }),
      /Invalid BURST_RATE_LIMIT_PER_MINUTE/,
    );
  });
});
