import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeMetadata, sanitizeMessage } from '../../dist/internal/limits.js';
import { DEFAULT_RESOURCE_LIMITS } from '../../dist/config.js';
import { buildCanonicalLogEvent } from '../../dist/event-builder.js';
import type { ResolvedSkyraLoggerConfig } from '../../dist/config.js';

describe('Security: Limits, Deep Redaction & Metadata Hardening', () => {
  it('1. Enforces maximum metadata nesting depth (32 levels)', () => {
    // Build a 40-level deep object
    let deepObj: any = { value: 'deep-leaf' };
    for (let i = 0; i < 40; i++) {
      deepObj = { level: i, nested: deepObj };
    }

    const sanitized: any = sanitizeMetadata(deepObj, DEFAULT_RESOURCE_LIMITS);

    // Drill down 32 levels
    let current = sanitized;
    let depth = 0;
    while (current && current.nested && typeof current.nested === 'object') {
      current = current.nested;
      depth++;
    }

    assert.ok(depth >= 31 && depth <= 32);
    assert.equal(current.nested, '[Max depth reached]');
  });

  it('2. Truncates oversized messages exceeding maxMessageLength', () => {
    const longMessage = 'A'.repeat(10_000);
    const sanitized = sanitizeMessage(longMessage, 100);

    assert.equal(sanitized.length > 100, true);
    assert.ok(sanitized.startsWith('A'.repeat(100)));
    assert.ok(sanitized.includes('[truncated 9900 chars]'));
  });

  it('3. Truncates oversized arrays exceeding maxArrayLength', () => {
    const bigArray = Array.from({ length: 600 }, (_, i) => `item-${i}`);
    const sanitized: any = sanitizeMetadata(bigArray, {
      ...DEFAULT_RESOURCE_LIMITS,
      maxArrayLength: 10,
    });

    assert.equal(sanitized.length, 11);
    assert.equal(sanitized[0], 'item-0');
    assert.equal(sanitized[9], 'item-9');
    assert.ok(sanitized[10].includes('items truncated'));
  });

  it('4. Limits object keys exceeding maxObjectEntries', () => {
    const bigObject: Record<string, number> = {};
    for (let i = 0; i < 50; i++) {
      bigObject[`key_${i}`] = i;
    }

    const sanitized: any = sanitizeMetadata(bigObject, {
      ...DEFAULT_RESOURCE_LIMITS,
      maxObjectEntries: 10,
    });

    const keys = Object.keys(sanitized);
    assert.equal(keys.length, 11); // 10 keys + __truncated_entries__ marker
    assert.ok(sanitized['__truncated_entries__']);
  });

  it('5. Deep compound sensitive keys are completely redacted', () => {
    const config: ResolvedSkyraLoggerConfig = {
      projectId: 'skyra-security',
      serviceName: 'sec-api',
      environment: 'production',
      instanceId: 'inst-01',
      level: 'info',
      transport: { type: 'stdout' },
      additionalSensitiveKeys: ['api_signature'],
      limits: DEFAULT_RESOURCE_LIMITS,
      fsyncOnLevels: new Set(['error', 'fatal']),
      clock: () => new Date('2026-10-22T10:00:00.000Z'),
      validationMode: 'off',
    };

    const event = buildCanonicalLogEvent(config, 'warn', 'Security audit', {
      userAuthToken: 'secret_token_val',
      client_secret_key: 'top_secret',
      accountPasswordHash: '$2b$12$abcdefg',
      deep: {
        nestedApiKey: 'key-12345',
        api_signature: 'sig-98765',
      },
    });

    const business = event.skyra.business as any;
    assert.equal(business.userAuthToken, '[REDACTED]');
    assert.equal(business.client_secret_key, '[REDACTED]');
    assert.equal(business.accountPasswordHash, '[REDACTED]');
    assert.equal(business.deep.nestedApiKey, '[REDACTED]');
    assert.equal(business.deep.api_signature, '[REDACTED]');
  });
});
