import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { CursorCodecService } from '../../../src/modules/search/application/cursor-codec.service.js';
import { QueryConfigService } from '../../../src/config/query-config.service.js';
import { QueryAuditService } from '../../../src/modules/audit/query-audit.service.js';
import {
  InvalidCursorException,
  CursorScopeMismatchException,
} from '../../../src/common/errors/query.errors.js';

describe('CursorCodecService Unit Tests (LOGHUB-QUERY-004)', () => {
  const config = new QueryConfigService({
    cursorSigningSecret: 'test-high-entropy-secret-key-32chars-min',
    cursorTtlMs: 3600000, // 1 hour
  });
  const audit = new QueryAuditService(config);
  const codec = new CursorCodecService(config, audit);

  const tenantId = 'tenant-acme-prod';
  const position = {
    timestamp: '2026-10-26T12:00:00.000Z',
    eventId: '00000000-0000-4000-8000-000000000001',
    segmentId: 'segment-0001.jsonl',
    recordOffset: 15,
  };

  const sampleQuery = {
    time_range: {
      start: '2026-10-26T10:00:00.000Z',
      end: '2026-10-26T14:00:00.000Z',
    },
    projects: ['auth-service', 'billing-api'],
    sort_direction: 'desc',
  };

  const fingerprint = codec.computeQueryFingerprint(sampleQuery);

  it('CC-1: should successfully encode and decode a valid signed cursor', () => {
    const encoded = codec.encode({
      position,
      sortDirection: 'desc',
      queryFingerprint: fingerprint,
      tenantId,
    });

    assert.ok(typeof encoded === 'string');
    assert.ok(encoded.length > 0);

    const decoded = codec.decode({
      encodedCursor: encoded,
      expectedTenantId: tenantId,
      expectedQueryFingerprint: fingerprint,
      expectedSortDirection: 'desc',
    });

    assert.equal(decoded.timestamp, position.timestamp);
    assert.equal(decoded.eventId, position.eventId);
    assert.equal(decoded.segmentId, position.segmentId);
    assert.equal(decoded.recordOffset, position.recordOffset);
  });

  it('CC-2: should reject tampered cursor payload (HMAC mismatch)', () => {
    const encoded = codec.encode({
      position,
      sortDirection: 'desc',
      queryFingerprint: fingerprint,
      tenantId,
    });

    const rawJson = Buffer.from(encoded, 'base64url').toString('utf8');
    const parsed = JSON.parse(rawJson);
    // Tamper with record offset
    parsed.record_offset = 999;
    const tamperedEncoded = Buffer.from(JSON.stringify(parsed), 'utf8').toString('base64url');

    assert.throws(
      () =>
        codec.decode({
          encodedCursor: tamperedEncoded,
          expectedTenantId: tenantId,
          expectedQueryFingerprint: fingerprint,
          expectedSortDirection: 'desc',
        }),
      (err: unknown) => {
        assert.ok(err instanceof InvalidCursorException);
        assert.ok((err as InvalidCursorException).message.includes('tampered'));
        return true;
      },
    );
  });

  it('CC-3: should reject cross-tenant cursor replay attack', () => {
    const encoded = codec.encode({
      position,
      sortDirection: 'desc',
      queryFingerprint: fingerprint,
      tenantId: 'tenant-victim',
    });

    assert.throws(
      () =>
        codec.decode({
          encodedCursor: encoded,
          expectedTenantId: 'tenant-attacker',
          expectedQueryFingerprint: fingerprint,
          expectedSortDirection: 'desc',
        }),
      (err: unknown) => {
        assert.ok(err instanceof CursorScopeMismatchException);
        return true;
      },
    );
  });

  it('CC-4: should reject cursor when search query parameters change between pages', () => {
    const encoded = codec.encode({
      position,
      sortDirection: 'desc',
      queryFingerprint: fingerprint,
      tenantId,
    });

    // Modified query with different projects
    const alteredQuery = {
      ...sampleQuery,
      projects: ['unrelated-project'],
    };
    const alteredFingerprint = codec.computeQueryFingerprint(alteredQuery);

    assert.throws(
      () =>
        codec.decode({
          encodedCursor: encoded,
          expectedTenantId: tenantId,
          expectedQueryFingerprint: alteredFingerprint,
          expectedSortDirection: 'desc',
        }),
      (err: unknown) => {
        assert.ok(err instanceof InvalidCursorException);
        assert.ok((err as InvalidCursorException).message.includes('do not match'));
        return true;
      },
    );
  });

  it('CC-5: should reject cursor when sort direction changes', () => {
    const encoded = codec.encode({
      position,
      sortDirection: 'desc',
      queryFingerprint: fingerprint,
      tenantId,
    });

    assert.throws(
      () =>
        codec.decode({
          encodedCursor: encoded,
          expectedTenantId: tenantId,
          expectedQueryFingerprint: fingerprint,
          expectedSortDirection: 'asc', // Changed direction
        }),
      (err: unknown) => {
        assert.ok(err instanceof InvalidCursorException);
        assert.ok((err as InvalidCursorException).message.includes('Sort direction'));
        return true;
      },
    );
  });

  it('CC-6: should reject expired cursors', () => {
    const expiredConfig = new QueryConfigService({
      cursorSigningSecret: 'test-high-entropy-secret-key-32chars-min',
      cursorTtlMs: 1, // 1 ms TTL
    });
    const expiredCodec = new CursorCodecService(expiredConfig, audit);

    const encoded = expiredCodec.encode({
      position,
      sortDirection: 'desc',
      queryFingerprint: fingerprint,
      tenantId,
    });

    // Busy-wait 5ms to guarantee expiration
    const start = Date.now();
    while (Date.now() - start < 5) {}

    assert.throws(
      () =>
        expiredCodec.decode({
          encodedCursor: encoded,
          expectedTenantId: tenantId,
          expectedQueryFingerprint: fingerprint,
          expectedSortDirection: 'desc',
        }),
      (err: unknown) => {
        assert.ok(err instanceof InvalidCursorException);
        assert.ok((err as InvalidCursorException).message.includes('expired'));
        return true;
      },
    );
  });

  it('CC-7: should reject garbage, non-base64url, or malformed strings', () => {
    assert.throws(
      () =>
        codec.decode({
          encodedCursor: 'not-a-valid-cursor-string-!@#$',
          expectedTenantId: tenantId,
          expectedQueryFingerprint: fingerprint,
          expectedSortDirection: 'desc',
        }),
      (err: unknown) => {
        assert.ok(err instanceof InvalidCursorException);
        return true;
      },
    );
  });
});
