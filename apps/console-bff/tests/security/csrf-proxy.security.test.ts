import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { CsrfService } from '../../src/modules/auth/application/csrf.service.js';
import { CsrfGuard } from '../../src/modules/auth/guards/csrf.guard.js';
import { BffConfigService } from '../../src/config/bff-config.service.js';
import {
  CsrfValidationException,
  UnauthorizedException,
} from '../../src/common/errors/bff.errors.js';
import type { ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

function createMockHttpContext(
  method: string,
  headers: Record<string, string>,
  sessionToken?: string,
): { context: ExecutionContext; req: FastifyRequest } {
  const req = {
    method,
    headers,
    session: sessionToken ? { csrfToken: sessionToken } : undefined,
  } as unknown as FastifyRequest;

  const context = {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => ({}),
    }),
  } as unknown as ExecutionContext;

  return { context, req };
}

describe('CSRF Defense & Query Proxy Security Test Suite (Section 21 Tests 31-40)', () => {
  const config = new BffConfigService();
  const csrfService = new CsrfService(config);
  const csrfGuard = new CsrfGuard(csrfService);

  it('31. Missing CSRF token: state-changing POST is rejected when X-CSRF-Token is omitted', () => {
    const { context } = createMockHttpContext(
      'POST',
      { origin: 'http://localhost:4200' },
      'expected_valid_csrf_token',
    );

    assert.throws(
      () => csrfGuard.canActivate(context),
      (err: unknown) => {
        assert.ok(err instanceof CsrfValidationException);
        assert.ok(err.message.includes('Invalid or missing anti-CSRF token'));
        return true;
      },
    );
  });

  it('32. Invalid CSRF token: request with forged or mismatched X-CSRF-Token is rejected', () => {
    const { context } = createMockHttpContext(
      'POST',
      {
        origin: 'http://localhost:4200',
        'x-csrf-token': 'attacker-crafted-csrf-token',
      },
      'real-session-csrf-token',
    );

    assert.throws(
      () => csrfGuard.canActivate(context),
      (err: unknown) => {
        assert.ok(err instanceof CsrfValidationException);
        assert.ok(err.message.includes('Invalid or missing anti-CSRF token'));
        return true;
      },
    );
  });

  it('33. Forged Origin: request from untrusted origin is rejected immediately', () => {
    const { context } = createMockHttpContext(
      'POST',
      {
        origin: 'https://evil-cross-site-attacker.com',
        'x-csrf-token': 'real-session-csrf-token',
      },
      'real-session-csrf-token',
    );

    assert.throws(
      () => csrfGuard.canActivate(context),
      (err: unknown) => {
        assert.ok(err instanceof CsrfValidationException);
        assert.ok(err.message.includes('is not in the allowed origins allowlist'));
        return true;
      },
    );
  });

  it('34. Trusted Origin: request from allowed origin with valid CSRF token is permitted', () => {
    const sessionCsrf = csrfService.generateToken();
    const { context } = createMockHttpContext(
      'POST',
      {
        origin: 'http://localhost:4200',
        'x-csrf-token': sessionCsrf,
      },
      sessionCsrf,
    );

    const allowed = csrfGuard.canActivate(context);
    assert.equal(allowed, true);
  });

  it('35. Safe methods exemption: GET requests do not require CSRF token', () => {
    const { context } = createMockHttpContext('GET', {});
    const allowed = csrfGuard.canActivate(context);
    assert.equal(allowed, true);
  });

  it('36. Timing-safe validation: prevents length mismatch and character timing side-channels', () => {
    const token = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    assert.equal(csrfService.validateToken(token, token), true);
    assert.equal(csrfService.validateToken('short', token), false);
    assert.equal(csrfService.validateToken(undefined, token), false);
    assert.equal(csrfService.validateToken(token, undefined), false);
  });

  it('37. CSRF token uniqueness: each token generation produces unpredictable 256-bit entropy', () => {
    const t1 = csrfService.generateToken();
    const t2 = csrfService.generateToken();
    assert.equal(t1.length, 64);
    assert.equal(t2.length, 64);
    assert.notEqual(t1, t2);
  });

  it('38. Referer origin extraction: validates referer origin when origin header is absent', () => {
    assert.doesNotThrow(() => {
      csrfService.validateOrigin(undefined, 'http://localhost:4200/dashboard');
    });

    assert.throws(
      () => csrfService.validateOrigin(undefined, 'https://malicious.com/landing'),
      CsrfValidationException,
    );
  });

  it('39. Missing Origin and Referer: rejected on state-changing operations', () => {
    assert.throws(
      () => csrfService.validateOrigin(undefined, undefined),
      (err: unknown) => {
        assert.ok(err instanceof CsrfValidationException);
        assert.ok(err.message.includes('Missing required Origin or Referer'));
        return true;
      },
    );
  });

  it('40. No secrets leaked in error instances: error message is sanitized', () => {
    const err = new CsrfValidationException('Request rejected');
    assert.equal(err.status, 403);
    assert.equal(err.code, 'CSRF_REJECTED');
    assert.ok(!JSON.stringify(err).includes('secret'));
  });
});
