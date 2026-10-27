import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import { OidcService } from '../../src/modules/auth/application/oidc.service.js';
import { BffConfigService } from '../../src/config/bff-config.service.js';
import { OidcCallbackException } from '../../src/common/errors/bff.errors.js';

describe('OIDC Security & PKCE Test Suite (Section 21 Tests 1-10)', () => {
  const config = new BffConfigService();
  const oidcService = new OidcService(config);

  it('1. Valid code flow: generates PKCE S256 challenge, state, and exchanges code', async () => {
    const authReq = oidcService.createAuthorizationRequest('/dashboard');
    assert.ok(authReq.authorizationUrl.includes('code_challenge_method=S256'));
    assert.ok(authReq.authorizationUrl.includes(`state=${authReq.state}`));
    assert.ok(authReq.authorizationUrl.includes('response_type=code'));

    const result = await oidcService.handleCallback('mock:usr_1:test@skyra.dev:Alice', authReq.state);
    assert.equal(result.tokens.user.email, 'test@skyra.dev');
    assert.equal(result.tokens.user.id, 'usr_1');
    assert.equal(result.returnUrl, '/dashboard');
    assert.ok(result.tokens.idToken.length > 0);
  });

  it('2. Invalid state: rejects callback when state does not match pending authorization', async () => {
    oidcService.createAuthorizationRequest();
    await assert.rejects(
      async () => {
        await oidcService.handleCallback('some_code', 'invalid-or-forged-state');
      },
      (err: unknown) => {
        assert.ok(err instanceof OidcCallbackException);
        assert.ok(err.message.includes('Invalid, replayed, or expired OIDC state'));
        return true;
      },
    );
  });

  it('3. Missing nonce: rejects ID token when nonce claim is missing', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        sub: 'usr_1',
        iss: 'https://auth.skyra.dev',
        aud: 'skyra-console-bff',
        exp: Math.floor(Date.now() / 1000) + 3600,
        // Missing nonce
      }),
    ).toString('base64url');
    const idToken = `${header}.${payload}.sig`;

    assert.throws(
      () => {
        oidcService.verifyIdToken(idToken, 'expected-nonce', 'https://auth.skyra.dev', 'skyra-console-bff');
      },
      (err: unknown) => {
        assert.ok(err instanceof OidcCallbackException);
        assert.ok(err.message.includes('nonce mismatch or missing'));
        return true;
      },
    );
  });

  it('4. Invalid nonce: rejects ID token when nonce does not match expected state nonce', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        sub: 'usr_1',
        iss: 'https://auth.skyra.dev',
        aud: 'skyra-console-bff',
        nonce: 'tampered-nonce',
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString('base64url');
    const idToken = `${header}.${payload}.sig`;

    assert.throws(
      () => {
        oidcService.verifyIdToken(idToken, 'real-expected-nonce', 'https://auth.skyra.dev', 'skyra-console-bff');
      },
      (err: unknown) => {
        assert.ok(err instanceof OidcCallbackException);
        assert.ok(err.message.includes('nonce mismatch'));
        return true;
      },
    );
  });

  it('5. Wrong issuer: rejects ID token signed by untrusted issuer', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        sub: 'usr_1',
        iss: 'https://malicious-idp.attacker.com',
        aud: 'skyra-console-bff',
        nonce: 'nonce123',
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString('base64url');
    const idToken = `${header}.${payload}.sig`;

    assert.throws(
      () => {
        oidcService.verifyIdToken(idToken, 'nonce123', 'https://auth.skyra.dev', 'skyra-console-bff');
      },
      (err: unknown) => {
        assert.ok(err instanceof OidcCallbackException);
        assert.ok(err.message.includes('issuer mismatch'));
        return true;
      },
    );
  });

  it('6. Wrong audience: rejects ID token intended for a different client application', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        sub: 'usr_1',
        iss: 'https://auth.skyra.dev',
        aud: 'third-party-foreign-client',
        nonce: 'nonce123',
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString('base64url');
    const idToken = `${header}.${payload}.sig`;

    assert.throws(
      () => {
        oidcService.verifyIdToken(idToken, 'nonce123', 'https://auth.skyra.dev', 'skyra-console-bff');
      },
      (err: unknown) => {
        assert.ok(err instanceof OidcCallbackException);
        assert.ok(err.message.includes('audience mismatch'));
        return true;
      },
    );
  });

  it('7. Expired ID token: rejects token whose exp is in the past', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        sub: 'usr_1',
        iss: 'https://auth.skyra.dev',
        aud: 'skyra-console-bff',
        nonce: 'nonce123',
        exp: Math.floor(Date.now() / 1000) - 300, // 5 minutes ago
      }),
    ).toString('base64url');
    const idToken = `${header}.${payload}.sig`;

    assert.throws(
      () => {
        oidcService.verifyIdToken(idToken, 'nonce123', 'https://auth.skyra.dev', 'skyra-console-bff');
      },
      (err: unknown) => {
        assert.ok(err instanceof OidcCallbackException);
        assert.ok(err.message.includes('ID token has expired'));
        return true;
      },
    );
  });

  it('8. Invalid signature/structure: rejects corrupted or malformed token strings', () => {
    assert.throws(
      () => {
        oidcService.verifyIdToken('not-a-valid-jwt', 'nonce123', 'https://auth.skyra.dev', 'skyra-console-bff');
      },
      (err: unknown) => {
        assert.ok(err instanceof OidcCallbackException);
        assert.ok(err.message.includes('Malformed ID token structure'));
        return true;
      },
    );
  });

  it('9. Missing sub claim: rejects ID token without a subject identifier', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        iss: 'https://auth.skyra.dev',
        aud: 'skyra-console-bff',
        nonce: 'nonce123',
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString('base64url');
    const idToken = `${header}.${payload}.sig`;

    assert.throws(
      () => {
        oidcService.verifyIdToken(idToken, 'nonce123', 'https://auth.skyra.dev', 'skyra-console-bff');
      },
      (err: unknown) => {
        assert.ok(err instanceof OidcCallbackException);
        assert.ok(err.message.includes('Missing subject claim'));
        return true;
      },
    );
  });

  it('10. Replayed callback: state is deleted on first exchange and cannot be reused', async () => {
    const authReq = oidcService.createAuthorizationRequest();
    // First exchange succeeds
    const firstExchange = await oidcService.handleCallback('mock:usr_2:bob@skyra.dev:Bob', authReq.state);
    assert.equal(firstExchange.tokens.user.email, 'bob@skyra.dev');

    // Second replay attempt with same state must fail
    await assert.rejects(
      async () => {
        await oidcService.handleCallback('mock:usr_2:bob@skyra.dev:Bob', authReq.state);
      },
      (err: unknown) => {
        assert.ok(err instanceof OidcCallbackException);
        assert.ok(err.message.includes('Invalid, replayed, or expired OIDC state'));
        return true;
      },
    );
  });
});
