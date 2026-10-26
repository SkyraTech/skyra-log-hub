import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { QueryConfigService } from '../../src/config/query-config.service.js';

describe('QueryConfigService Unit Tests (LOGHUB-QUERY-002)', () => {
  it('should load default configuration in non-production mode', () => {
    const config = new QueryConfigService({
      nodeEnv: 'test',
      port: 3100,
      host: '127.0.0.1',
    });

    assert.equal(config.nodeEnv, 'test');
    assert.equal(config.port, 3100);
    assert.equal(config.host, '127.0.0.1');
    assert.equal(config.queryTimeoutMs, 30000);
    assert.equal(config.maxSegmentsPerQuery, 500);
    assert.equal(config.maxTimeRangeDays, 30);
    assert.equal(config.enableAuditLogging, true);
    assert.deepEqual(config.corsOrigins, ['*']);
    assert.equal(config.isProduction(), false);
  });

  it('should reject production startup if DATABASE_URL contains REPLACE_ME', () => {
    assert.throws(
      () =>
        new QueryConfigService({
          nodeEnv: 'production',
          databaseUrl: 'postgresql://user:REPLACE_ME@db:5432/skyra',
          authMode: 'jwt',
        }),
      /Production startup requires a valid, non-placeholder DATABASE_URL/,
    );
  });

  it('should reject production startup if authMode is "test"', () => {
    assert.throws(
      () =>
        new QueryConfigService({
          nodeEnv: 'production',
          databaseUrl: 'postgresql://user:secret@db:5432/skyra',
          authMode: 'test',
        }),
      /QUERY_AUTH_MODE cannot be "test" in production environment/,
    );
  });

  it('should accept custom valid configuration overrides', () => {
    const config = new QueryConfigService({
      nodeEnv: 'development',
      port: 8080,
      queryTimeoutMs: 15000,
      maxSegmentsPerQuery: 200,
      maxTimeRangeDays: 7,
      corsOrigins: ['https://console.skyra.internal'],
    });

    assert.equal(config.port, 8080);
    assert.equal(config.queryTimeoutMs, 15000);
    assert.equal(config.maxSegmentsPerQuery, 200);
    assert.equal(config.maxTimeRangeDays, 7);
    assert.deepEqual(config.corsOrigins, ['https://console.skyra.internal']);
  });
});
