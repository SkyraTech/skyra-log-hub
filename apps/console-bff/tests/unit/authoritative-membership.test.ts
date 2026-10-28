import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { AuthoritativeMembershipAdapter } from '../../src/modules/auth/application/authoritative-membership.adapter.js';
import { BffConfigService } from '../../src/config/bff-config.service.js';
import { MembershipProviderUnavailableException } from '../../src/common/errors/bff.errors.js';

describe('AuthoritativeMembershipAdapter (LOGHUB-ADMIN-002 Gate A)', () => {
  it('fails closed when useAuthoritativeMembership is false', async () => {
    const config = new BffConfigService();
    // Default config has useAuthoritativeMembership = false
    assert.strictEqual(config.useAuthoritativeMembership, false);

    const adapter = new AuthoritativeMembershipAdapter(config);
    await assert.rejects(
      async () => {
        await adapter.resolveMemberships('usr-1', 'alice@skyra.internal');
      },
      (err: unknown) => {
        assert.ok(err instanceof MembershipProviderUnavailableException);
        assert.match((err as Error).message, /disabled/);
        return true;
      },
    );
  });

  it('fails closed in production mode when authoritative provider is pending Gate B', async () => {
    process.env['NODE_ENV'] = 'production';
    try {
      const config = new BffConfigService();
      assert.strictEqual(config.isProduction, true);
      const adapter = new AuthoritativeMembershipAdapter(config);
      await assert.rejects(
        async () => {
          await adapter.resolveMemberships('usr-prod-1', 'alice@skyra.internal');
        },
        (err: unknown) => {
          assert.ok(err instanceof MembershipProviderUnavailableException);
          assert.match((err as Error).message, /pending Gate B/);
          return true;
        },
      );
    } finally {
      process.env['NODE_ENV'] = 'development';
    }
  });
});
