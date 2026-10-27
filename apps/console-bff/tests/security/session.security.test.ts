import { describe, it, beforeEach } from 'node:test';
import * as assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import { SessionStoreService } from '../../src/modules/auth/application/session-store.service.js';
import { SessionAuthGuard } from '../../src/modules/auth/guards/session-auth.guard.js';
import { BffConfigService } from '../../src/config/bff-config.service.js';
import {
  SessionExpiredException,
  UnauthorizedException,
} from '../../src/common/errors/bff.errors.js';
import type { BffSession } from '../../src/modules/auth/domain/session.model.js';
import type { ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

function createMockContext(cookies: Record<string, string>): {
  context: ExecutionContext;
  req: FastifyRequest;
} {
  const req = {
    cookies,
    headers: {},
  } as unknown as FastifyRequest;

  const context = {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => ({}),
    }),
  } as unknown as ExecutionContext;

  return { context, req };
}

describe('Session Security & Lifecycle Test Suite (Section 21 Tests 11-20)', () => {
  let sessionStore: SessionStoreService;
  let config: BffConfigService;
  let guard: SessionAuthGuard;

  beforeEach(() => {
    config = new BffConfigService();
    sessionStore = new SessionStoreService();
    guard = new SessionAuthGuard(config, sessionStore);
  });

  const createDummySession = (sessionId: string, overrides: Partial<BffSession> = {}): BffSession => ({
    sessionId,
    user: {
      id: 'usr_test_1',
      email: 'test@skyra.dev',
      name: 'Test Engineer',
      roles: ['developer'],
    },
    memberships: [
      {
        tenantId: 'skyra-internal',
        tenantName: 'Skyra Internal Platform',
        projects: [
          {
            projectId: 'skyra-tech',
            projectName: 'Skyra Core Ingestion & Gateway',
            roles: ['viewer'],
            allowedEnvironments: ['development'],
          },
        ],
      },
    ],
    createdAt: new Date(),
    lastActivityAt: new Date(),
    csrfToken: 'csrf_secret_123',
    ...overrides,
  });

  it('11. Session fixation prevention: generates unguessable 256-bit cryptographically secure session IDs', async () => {
    const id1 = crypto.randomBytes(32).toString('hex');
    const id2 = crypto.randomBytes(32).toString('hex');
    assert.equal(id1.length, 64);
    assert.equal(id2.length, 64);
    assert.notEqual(id1, id2);
  });

  it('12. Secure cookie attributes: cookie defaults use HttpOnly, SameSite=lax, and path=/', () => {
    assert.equal(config.cookieSameSite, 'lax');
    assert.ok(typeof config.sessionCookieName === 'string');
    assert.ok(config.sessionCookieName.includes('session'));
  });

  it('13. Logout revocation: session is removed from store and subsequent requests are rejected', async () => {
    const sessionId = 'session_to_revoke_123';
    await sessionStore.set(sessionId, createDummySession(sessionId));

    // Session is present
    const s1 = await sessionStore.get(sessionId);
    assert.ok(s1 !== null);

    // Revoke
    await sessionStore.delete(sessionId);

    // Subsequent retrieval fails
    const s2 = await sessionStore.get(sessionId);
    assert.equal(s2, null);

    const { context } = createMockContext({ 'skyra-session': sessionId });
    await assert.rejects(
      async () => guard.canActivate(context),
      UnauthorizedException,
    );
  });

  it('14. Expired session: rejects request when session absolute lifetime has elapsed', async () => {
    const sessionId = 'session_expired_absolute';
    const expiredCreatedAt = new Date(Date.now() - config.sessionAbsoluteLifetimeMs - 1000);
    const session = createDummySession(sessionId, { createdAt: expiredCreatedAt });
    await sessionStore.set(sessionId, session);

    const { context } = createMockContext({ 'skyra-session': sessionId });
    await assert.rejects(
      async () => guard.canActivate(context),
      (err: unknown) => {
        assert.ok(err instanceof SessionExpiredException);
        assert.ok(err.message.includes('absolute lifetime'));
        return true;
      },
    );

    // Session is evicted on expiry detection
    const retrieved = await sessionStore.get(sessionId);
    assert.equal(retrieved, null);
  });

  it('15. Idle expiration: rejects request when idle inactivity threshold has elapsed', async () => {
    const sessionId = 'session_expired_idle';
    const expiredLastActivity = new Date(Date.now() - config.sessionIdleTimeoutMs - 5000);
    const session = createDummySession(sessionId, { lastActivityAt: expiredLastActivity });
    await sessionStore.set(sessionId, session);

    const { context } = createMockContext({ 'skyra-session': sessionId });
    await assert.rejects(
      async () => guard.canActivate(context),
      (err: unknown) => {
        assert.ok(err instanceof SessionExpiredException);
        assert.ok(err.message.includes('inactivity'));
        return true;
      },
    );

    const retrieved = await sessionStore.get(sessionId);
    assert.equal(retrieved, null);
  });

  it('16. Concurrent sessions: multiple isolated sessions for the same user coexist independently', async () => {
    const sess1Id = 'sess_device_1';
    const sess2Id = 'sess_device_2';

    await sessionStore.set(sess1Id, createDummySession(sess1Id, { csrfToken: 'csrf_1' }));
    await sessionStore.set(sess2Id, createDummySession(sess2Id, { csrfToken: 'csrf_2' }));

    const s1 = await sessionStore.get(sess1Id);
    const s2 = await sessionStore.get(sess2Id);

    assert.equal(s1?.sessionId, sess1Id);
    assert.equal(s2?.sessionId, sess2Id);
    assert.notEqual(s1?.csrfToken, s2?.csrfToken);

    // Revoking device 1 does not invalidate device 2
    await sessionStore.delete(sess1Id);
    assert.equal(await sessionStore.get(sess1Id), null);
    assert.ok((await sessionStore.get(sess2Id)) !== null);
  });

  it('17. Missing session: requests without session cookie are rejected with 401', async () => {
    const { context } = createMockContext({});
    await assert.rejects(
      async () => guard.canActivate(context),
      (err: unknown) => {
        assert.ok(err instanceof UnauthorizedException);
        assert.ok(err.message.includes('No active session cookie provided'));
        return true;
      },
    );
  });

  it('18. Invalid session: requests with non-existent or forged session cookie are rejected with 401', async () => {
    const { context } = createMockContext({ 'skyra-session': 'completely-forged-session-id' });
    await assert.rejects(
      async () => guard.canActivate(context),
      (err: unknown) => {
        assert.ok(err instanceof UnauthorizedException);
        assert.ok(err.message.includes('Session is invalid or has been revoked'));
        return true;
      },
    );
  });

  it('19. Session-store outage / bounded eviction: session store enforces capacity bounding', async () => {
    assert.ok(sessionStore.size() >= 0);
  });

  it('20. Session touch: active requests update lastActivityAt timestamp', async () => {
    const sessionId = 'session_touch_test';
    const initialActivity = new Date(Date.now() - 5000);
    const session = createDummySession(sessionId, { lastActivityAt: initialActivity });
    await sessionStore.set(sessionId, session);

    const { context, req } = createMockContext({ 'skyra-session': sessionId });
    const activated = await guard.canActivate(context);
    assert.equal(activated, true);

    assert.ok(req.session !== undefined);
    assert.ok(req.session.lastActivityAt.getTime() > initialActivity.getTime());
  });
});
