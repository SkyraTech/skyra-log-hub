import { describe, it, beforeEach } from 'node:test';
import * as assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import { AuthService } from '../../src/auth/auth.service.js';
import { InMemoryCredentialRepository } from '../../src/metadata/repositories/in-memory-credential.repository.js';
import { InMemoryTenantRepository } from '../../src/metadata/repositories/in-memory-tenant.repository.js';
import { GatewayException } from '../../src/common/types/gateway-exception.js';
import { ErrorCode } from '../../src/common/types/error-code.enum.js';

describe('AuthService Unit Tests', () => {
  let authService: AuthService;
  let credRepo: InMemoryCredentialRepository;
  let tenantRepo: InMemoryTenantRepository;

  const rawToken = 'sk_live_test_secret_token_1234567890';
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const tenantId = '00000000-0000-0000-0000-000000000001';

  beforeEach(async () => {
    credRepo = new InMemoryCredentialRepository();
    tenantRepo = new InMemoryTenantRepository();
    authService = new AuthService(credRepo, tenantRepo);

    await tenantRepo.save({
      id: tenantId,
      code: 'skyra-internal',
      name: 'Skyra Internal',
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await credRepo.save({
      id: 'cred-001',
      tenantId,
      keyHash: tokenHash,
      keyPrefix: 'sk_live_test',
      description: 'Test Server Ingestion Token',
      allowedProjects: ['skyra-tech'],
      allowedEnvironments: ['production', 'staging'],
      rateLimitPerMin: 600,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 86400000), // 24h in future
      isRevoked: false,
      lastUsedAt: null,
    });
  });

  it('should authenticate a valid active machine token', async () => {
    const identity = await authService.authenticate(rawToken);
    assert.equal(identity.credentialId, 'cred-001');
    assert.equal(identity.tenantId, tenantId);
    assert.deepEqual(identity.allowedProjects, ['skyra-tech']);
    assert.deepEqual(identity.allowedEnvironments, ['production', 'staging']);
    assert.equal(identity.rateLimitPerMin, 600);
  });

  it('should reject missing or empty token', async () => {
    await assert.rejects(
      async () => authService.authenticate(''),
      (err: any) => {
        assert.ok(err instanceof GatewayException);
        assert.equal(err.code, ErrorCode.UNAUTHORIZED);
        return true;
      },
    );
  });

  it('should reject unknown token and not leak token value', async () => {
    const badToken = 'sk_live_unknown_token_9999999999';
    await assert.rejects(
      async () => authService.authenticate(badToken),
      (err: any) => {
        assert.ok(err instanceof GatewayException);
        assert.equal(err.code, ErrorCode.UNAUTHORIZED);
        assert.ok(!err.message.includes(badToken));
        return true;
      },
    );
  });

  it('should reject revoked credential', async () => {
    await credRepo.save({
      id: 'cred-revoked',
      tenantId,
      keyHash: authService.hashToken('revoked_token'),
      keyPrefix: 'sk_live',
      description: 'Revoked',
      allowedProjects: ['*'],
      allowedEnvironments: ['*'],
      rateLimitPerMin: 600,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 86400000),
      isRevoked: true,
      lastUsedAt: null,
    });

    await assert.rejects(
      async () => authService.authenticate('revoked_token'),
      (err: any) => {
        assert.ok(err instanceof GatewayException);
        assert.equal(err.code, ErrorCode.UNAUTHORIZED);
        assert.match(err.message, /revoked/i);
        return true;
      },
    );
  });

  it('should reject expired credential', async () => {
    await credRepo.save({
      id: 'cred-expired',
      tenantId,
      keyHash: authService.hashToken('expired_token'),
      keyPrefix: 'sk_live',
      description: 'Expired',
      allowedProjects: ['*'],
      allowedEnvironments: ['*'],
      rateLimitPerMin: 600,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() - 3600000), // 1 hour ago
      isRevoked: false,
      lastUsedAt: null,
    });

    await assert.rejects(
      async () => authService.authenticate('expired_token'),
      (err: any) => {
        assert.ok(err instanceof GatewayException);
        assert.equal(err.code, ErrorCode.UNAUTHORIZED);
        assert.match(err.message, /expired/i);
        return true;
      },
    );
  });

  it('should reject suspended tenant', async () => {
    await tenantRepo.save({
      id: tenantId,
      code: 'skyra-internal',
      name: 'Skyra Internal',
      status: 'SUSPENDED',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await assert.rejects(
      async () => authService.authenticate(rawToken),
      (err: any) => {
        assert.ok(err instanceof GatewayException);
        assert.equal(err.code, ErrorCode.PROJECT_ACCESS_DENIED);
        assert.match(err.message, /suspended/i);
        return true;
      },
    );
  });
});
