import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { retentionInput } from '../../src/modules/projects/retention.service.js';
import { AdminConfigService } from '../../src/core/config/admin-config.service.js';
import { TrustedAssertionGuard } from '../../src/core/security/trusted-assertion.guard.js';

// Retention payload validation
for (const invalid of [
  null,
  [],
  {},
  'string',
  123,
  { retentionDays: 0 },
  { retentionDays: 366 },
  { retentionDays: -5 },
  { retentionDays: 30.5 },
  { retentionDays: '30' },
  { enableParquetPurge: 'true' },
  { enableParquetPurge: 1 },
  { isLegalHold: 'false' },
  { isLegalHold: 0 },
  { unknownField: 'val' },
  { retentionDays: 30, rogue: true },
]) {
  test('retentionInput rejects ' + JSON.stringify(invalid), () => {
    assert.throws(() => retentionInput(invalid));
  });
}

test('retentionInput accepts valid partial and full configurations', () => {
  assert.deepEqual(retentionInput({ retentionDays: 1 }), { retentionDays: 1 });
  assert.deepEqual(retentionInput({ retentionDays: 365 }), { retentionDays: 365 });
  assert.deepEqual(retentionInput({ retentionDays: 30, enableParquetPurge: false }), {
    retentionDays: 30,
    enableParquetPurge: false,
  });
  assert.deepEqual(retentionInput({ isLegalHold: true }), { isLegalHold: true });
  assert.deepEqual(
    retentionInput({ retentionDays: 90, enableParquetPurge: true, isLegalHold: false }),
    { retentionDays: 90, enableParquetPurge: true, isLegalHold: false },
  );
});

// Trusted assertion scopes
for (const scope of ['retention.read', 'retention.manage']) {
  test(scope + ' assertions require explicit signing key and at most 60 seconds lifetime', () => {
    const config = new AdminConfigService({ INTERNAL_JWT_SECRET: 'retention-test-secret-'.repeat(4) });
    const now = Math.floor(Date.now() / 1000);
    const sign = (c: AdminConfigService, extra: Record<string, unknown> = {}) => {
      const h = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url');
      const p = Buffer.from(
        JSON.stringify({
          iss: c.internalJwtIssuer,
          aud: c.internalJwtAudience,
          sub: 'subject-user',
          tenant_id: 'a0000000-0000-0000-0000-000000000001',
          scope,
          iat: now,
          exp: now + 60,
          ...extra,
        }),
      ).toString('base64url');
      return h + '.' + p + '.' + createHmac('sha256', c.internalJwtSecret).update(h + '.' + p).digest('base64url');
    };

    const guard = new TrustedAssertionGuard(config);
    const principal = guard.verifyAssertionToken(sign(config));
    assert.equal(principal.scope, scope);
    assert.equal(principal.tenantId, 'a0000000-0000-0000-0000-000000000001');

    // Rejects expired token
    assert.throws(() => guard.verifyAssertionToken(sign(config, { exp: now - 10 })));
    // Rejects excessive lifetime
    assert.throws(() => guard.verifyAssertionToken(sign(config, { exp: now + 3600 })));
  });
}
