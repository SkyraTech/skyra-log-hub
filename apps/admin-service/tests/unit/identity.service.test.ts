import { describe, it, beforeEach } from 'node:test';
import * as assert from 'node:assert';
import { IdentityService } from '../../src/modules/identity/application/identity.service.js';
import { InMemoryIdentityRepository } from '../../src/modules/identity/infrastructure/in-memory-identity.repository.js';
import { AdminConfigService } from '../../src/core/config/admin-config.service.js';
import {
  InvalidIdentityAssertionException,
  IdentityNotFoundException,
  DisabledIdentityException,
} from '../../src/core/errors/admin.errors.js';

describe('IdentityService Security & Integrity Suite (Section 20 Scenarios 1-5)', () => {
  let repo: InMemoryIdentityRepository;
  let config: AdminConfigService;
  let service: IdentityService;

  beforeEach(() => {
    repo = new InMemoryIdentityRepository();
    config = new AdminConfigService({
      TRUSTED_OIDC_ISSUERS: 'https://auth.skyra.internal,https://accounts.google.com',
      ADMIN_PERSISTENCE_ENABLED: 'false',
    });
    service = new IdentityService(repo, config);
  });

  it('1. Valid (issuer, subject) resolves successfully', async () => {
    const user = await service.provisionUser({
      issuer: 'https://auth.skyra.internal',
      subject: 'sub-user-1234',
      email: 'alice@skyra.internal',
      displayName: 'Alice Architect',
    });

    const resolved = await service.resolveIdentity('https://auth.skyra.internal', 'sub-user-1234');
    assert.strictEqual(resolved.id, user.id);
    assert.strictEqual(resolved.email, 'alice@skyra.internal');
    assert.strictEqual(resolved.status, 'ACTIVE');
  });

  it('2. Same subject under different issuers produces distinct isolated users', async () => {
    const googleUser = await service.provisionUser({
      issuer: 'https://accounts.google.com',
      subject: 'shared-subject-id',
      email: 'user@gmail.com',
      displayName: 'Google Alice',
    });

    const skyraUser = await service.provisionUser({
      issuer: 'https://auth.skyra.internal',
      subject: 'shared-subject-id',
      email: 'alice@skyra.internal',
      displayName: 'Corporate Alice',
    });

    assert.notStrictEqual(googleUser.id, skyraUser.id);

    const resolvedGoogle = await service.resolveIdentity('https://accounts.google.com', 'shared-subject-id');
    const resolvedSkyra = await service.resolveIdentity('https://auth.skyra.internal', 'shared-subject-id');

    assert.strictEqual(resolvedGoogle.email, 'user@gmail.com');
    assert.strictEqual(resolvedSkyra.email, 'alice@skyra.internal');
  });

  it('3. Same email under different identities coexists without account hijacking', async () => {
    const userA = await service.provisionUser({
      issuer: 'https://auth.skyra.internal',
      subject: 'corp-sub-99',
      email: 'dinesh@company.com',
      displayName: 'Dinesh Corporate',
    });

    const userB = await service.provisionUser({
      issuer: 'https://accounts.google.com',
      subject: 'google-sub-77',
      email: 'dinesh@company.com',
      displayName: 'Dinesh Personal',
    });

    assert.notStrictEqual(userA.id, userB.id);
    const usersWithEmail = await repo.findByEmail('dinesh@company.com');
    assert.strictEqual(usersWithEmail.length, 2);
  });

  it('4. Unknown or untrusted issuer is strictly rejected', async () => {
    await assert.rejects(
      async () => {
        await service.resolveIdentity('https://evil-untrusted-idp.com', 'malicious-sub');
      },
      (err: unknown) => {
        assert.ok(err instanceof InvalidIdentityAssertionException);
        assert.match((err as Error).message, /Untrusted OIDC issuer/);
        return true;
      },
    );
  });

  it('5. Disabled identity (SUSPENDED or DEACTIVATED) is denied access', async () => {
    const user = await service.provisionUser({
      issuer: 'https://auth.skyra.internal',
      subject: 'departed-employee',
      email: 'departed@skyra.internal',
      displayName: 'Departed Employee',
    });

    await service.updateUserStatus(user.id, 'SUSPENDED');

    await assert.rejects(
      async () => {
        await service.resolveIdentity('https://auth.skyra.internal', 'departed-employee');
      },
      (err: unknown) => {
        assert.ok(err instanceof DisabledIdentityException);
        assert.match((err as Error).message, /SUSPENDED/);
        return true;
      },
    );

    await service.updateUserStatus(user.id, 'DEACTIVATED');

    await assert.rejects(
      async () => {
        await service.resolveIdentity('https://auth.skyra.internal', 'departed-employee');
      },
      (err: unknown) => {
        assert.ok(err instanceof DisabledIdentityException);
        assert.match((err as Error).message, /DEACTIVATED/);
        return true;
      },
    );
  });
});
