import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import { JwtVerificationService } from '../../src/modules/auth/application/jwt-verification.service.js';
import { TestTokenVerifier } from '../../src/modules/auth/application/test-token.verifier.js';
import { QueryConfigService } from '../../src/config/query-config.service.js';
import { UnauthorizedException } from '../../src/common/errors/query.errors.js';

function base64UrlEncode(data: string | Buffer): string {
  const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function createSignedHs256Token(
  payload: Record<string, unknown>,
  secret: string,
  headerOverride?: Record<string, unknown>,
): string {
  const header = { alg: 'HS256', typ: 'JWT', ...headerOverride };
  const h64 = base64UrlEncode(JSON.stringify(header));
  const p64 = base64UrlEncode(JSON.stringify(payload));
  const data = `${h64}.${p64}`;
  const sig = crypto.createHmac('sha256', secret).update(data).digest();
  const s64 = base64UrlEncode(sig);
  return `${data}.${s64}`;
}

describe('JWT & Test Verification Unit Tests (LOGHUB-QUERY-002)', () => {
  const secret = 'super-secret-key-32-characters-long!';
  const issuer = 'https://auth.skyra.internal';
  const audience = 'skyra-loghub-query';

  const config = new QueryConfigService({
    nodeEnv: 'test',
    jwtSecretOrPublicKey: secret,
    jwtIssuer: issuer,
    jwtAudience: audience,
  });

  const jwtService = new JwtVerificationService(config);
  const testVerifier = new TestTokenVerifier(jwtService);

  it('should verify a valid HS256 JWT and extract principal', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = createSignedHs256Token(
      {
        sub: 'user-001',
        iss: issuer,
        aud: audience,
        tenant_id: 'tenant-alpha',
        allowed_projects: ['proj-1', 'proj-2'],
        roles: ['analyst'],
        iat: now - 10,
        exp: now + 3600,
      },
      secret,
    );

    const principal = await jwtService.verifyToken(token);
    assert.equal(principal.sub, 'user-001');
    assert.equal(principal.tenantId, 'tenant-alpha');
    assert.deepEqual(principal.authorizedProjects, ['proj-1', 'proj-2']);
    assert.deepEqual(principal.roles, ['analyst']);
  });

  it('should reject expired JWT with UnauthorizedException', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = createSignedHs256Token(
      {
        sub: 'user-001',
        iss: issuer,
        aud: audience,
        tenant_id: 'tenant-alpha',
        iat: now - 3600,
        exp: now - 10,
      },
      secret,
    );

    await assert.rejects(
      () => jwtService.verifyToken(token),
      (err: unknown) => {
        assert.ok(err instanceof UnauthorizedException);
        assert.match((err as UnauthorizedException).message, /expired/);
        return true;
      },
    );
  });

  it('should reject token with wrong issuer', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = createSignedHs256Token(
      {
        sub: 'user-001',
        iss: 'https://evil.attacker.com',
        aud: audience,
        tenant_id: 'tenant-alpha',
        iat: now,
        exp: now + 3600,
      },
      secret,
    );

    await assert.rejects(
      () => jwtService.verifyToken(token),
      (err: unknown) => {
        assert.ok(err instanceof UnauthorizedException);
        assert.match((err as UnauthorizedException).message, /Invalid JWT issuer/);
        return true;
      },
    );
  });

  it('should reject token with wrong audience', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = createSignedHs256Token(
      {
        sub: 'user-001',
        iss: issuer,
        aud: 'wrong-audience',
        tenant_id: 'tenant-alpha',
        iat: now,
        exp: now + 3600,
      },
      secret,
    );

    await assert.rejects(
      () => jwtService.verifyToken(token),
      (err: unknown) => {
        assert.ok(err instanceof UnauthorizedException);
        assert.match((err as UnauthorizedException).message, /Invalid JWT audience/);
        return true;
      },
    );
  });

  it('should reject token with invalid signature', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = createSignedHs256Token(
      {
        sub: 'user-001',
        iss: issuer,
        aud: audience,
        tenant_id: 'tenant-alpha',
        iat: now,
        exp: now + 3600,
      },
      'different-secret-wrong-key',
    );

    await assert.rejects(
      () => jwtService.verifyToken(token),
      (err: unknown) => {
        assert.ok(err instanceof UnauthorizedException);
        assert.match((err as UnauthorizedException).message, /Invalid JWT cryptographic signature/);
        return true;
      },
    );
  });

  it('should verify test tokens correctly with TestTokenVerifier', async () => {
    const payload = {
      sub: 'test-admin',
      tenantId: 'alpha-corp',
      authorizedProjects: ['skyra-tech'],
      roles: ['admin'],
    };
    const b64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const token = `test-token:${b64}`;

    const principal = await testVerifier.verifyToken(token);
    assert.equal(principal.sub, 'test-admin');
    assert.equal(principal.tenantId, 'alpha-corp');
    assert.deepEqual(principal.authorizedProjects, ['skyra-tech']);
    assert.deepEqual(principal.roles, ['admin']);
  });

  it('should reject invalid test token payload with UnauthorizedException', async () => {
    await assert.rejects(
      () => testVerifier.verifyToken('test-token:not-valid-base64-json!'),
      (err: unknown) => {
        assert.ok(err instanceof UnauthorizedException);
        return true;
      },
    );
  });
});
