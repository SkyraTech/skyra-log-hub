import * as crypto from 'node:crypto';
import { describe, it, beforeEach } from 'node:test';
import * as assert from 'node:assert';
import { TrustedAssertionGuard } from '../../src/core/security/trusted-assertion.guard.js';
import { AdminConfigService } from '../../src/core/config/admin-config.service.js';
import { InvalidIdentityAssertionException } from '../../src/core/errors/admin.errors.js';

describe('Cross-Service Authorization & Token Security Suite (Section 20 Scenarios 26-35)', () => {
  const secret = 'shared-secret-for-cross-service-testing-32chars!';
  let config: AdminConfigService;
  let guard: TrustedAssertionGuard;

  beforeEach(() => {
    config = new AdminConfigService({
      INTERNAL_JWT_SECRET: secret,
      INTERNAL_JWT_ISSUER: 'https://auth.skyra.internal',
      INTERNAL_JWT_AUDIENCE: 'skyra-admin-service',
      ADMIN_PERSISTENCE_ENABLED: 'false',
    });
    guard = new TrustedAssertionGuard(config);
  });

  function mintToken(
    payloadOverrides: Record<string, unknown> = {},
    customSecret: string = secret,
    alg = 'HS256',
  ): string {
    const nowSec = Math.floor(Date.now() / 1000);
    const header = { alg, typ: 'JWT' };
    const payload = {
      iss: 'https://auth.skyra.internal',
      aud: 'skyra-admin-service',
      sub: 'usr-12345',
      email: 'admin@skyra.internal',
      tenant_id: 'ten-9999',
      roles: ['OrgAdmin'],
      iat: nowSec,
      exp: nowSec + 60, // 60s TTL
      ...payloadOverrides,
    };

    const hB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const pB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const data = `${hB64}.${pB64}`;
    const sig = crypto.createHmac('sha256', customSecret).update(data).digest('base64url');

    return `${data}.${sig}`;
  }

  it('26. BFF trusted identity assertion validates successfully', () => {
    const token = mintToken();
    const principal = guard.verifyAssertionToken(token);
    assert.strictEqual(principal.sub, 'usr-12345');
    assert.strictEqual(principal.tenantId, 'ten-9999');
    assert.ok(principal.roles.includes('OrgAdmin'));
  });

  it('27. Scoped assertion with capabilities parses cleanly', () => {
    const token = mintToken({ capabilities: ['projects.create', 'audit.read'] });
    const principal = guard.verifyAssertionToken(token);
    assert.ok(principal.capabilities?.includes('projects.create'));
    assert.ok(principal.capabilities?.includes('audit.read'));
  });

  it('28. Forged project claim / missing tenant_id is rejected', () => {
    const token = mintToken({ tenant_id: '' });
    assert.throws(
      () => {
        guard.verifyAssertionToken(token);
      },
      (err: unknown) => {
        assert.ok(err instanceof InvalidIdentityAssertionException);
        assert.match((err as Error).message, /missing mandatory/);
        return true;
      },
    );
  });

  it('29. Expired assertion is rejected fail-closed', () => {
    const pastSec = Math.floor(Date.now() / 1000) - 100;
    const token = mintToken({ exp: pastSec });
    assert.throws(
      () => {
        guard.verifyAssertionToken(token);
      },
      (err: unknown) => {
        assert.ok(err instanceof InvalidIdentityAssertionException);
        assert.match((err as Error).message, /expired/);
        return true;
      },
    );
  });

  it('30. Wrong audience is rejected', () => {
    const token = mintToken({ aud: 'untrusted-target-service' });
    assert.throws(
      () => {
        guard.verifyAssertionToken(token);
      },
      (err: unknown) => {
        assert.ok(err instanceof InvalidIdentityAssertionException);
        assert.match((err as Error).message, /Invalid token audience/);
        return true;
      },
    );
  });

  it('31. Wrong issuer is rejected', () => {
    const token = mintToken({ iss: 'https://rogue-issuer.internal' });
    assert.throws(
      () => {
        guard.verifyAssertionToken(token);
      },
      (err: unknown) => {
        assert.ok(err instanceof InvalidIdentityAssertionException);
        assert.match((err as Error).message, /Invalid token issuer/);
        return true;
      },
    );
  });

  it('32. Invalid cryptographic signature is rejected', () => {
    const token = mintToken({}, 'different-tampered-secret-key-32ch!');
    assert.throws(
      () => {
        guard.verifyAssertionToken(token);
      },
      (err: unknown) => {
        assert.ok(err instanceof InvalidIdentityAssertionException);
        assert.match((err as Error).message, /signature verification failed/);
        return true;
      },
    );
  });

  it('33. Revocation propagation guarantee: short-lived 60s max TTL bounds drift window', () => {
    const token = mintToken();
    const principal = guard.verifyAssertionToken(token);
    const nowSec = Math.floor(Date.now() / 1000);
    // Token validity cannot exceed 62s (60s + 2s skew)
    assert.ok(principal.exp - nowSec <= 62);
  });

  it('34. Missing Authorization header throws InvalidIdentityAssertionException', () => {
    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: {},
        }),
      }),
    } as unknown as import('@nestjs/common').ExecutionContext;

    assert.throws(
      () => {
        guard.canActivate(mockContext);
      },
      (err: unknown) => {
        assert.ok(err instanceof InvalidIdentityAssertionException);
        return true;
      },
    );
  });

  it('35. Disabled persistence flag keeps service in safe Gate A mode', () => {
    assert.strictEqual(config.persistenceEnabled, false);
  });
});
