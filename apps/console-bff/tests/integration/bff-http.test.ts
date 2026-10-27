import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyCookie from '@fastify/cookie';
import { AppModule } from '../../src/app.module.js';
import { ProblemDetailsFilter } from '../../src/common/filters/problem-details.filter.js';

describe('BFF End-to-End HTTP Integration Test Suite', () => {
  let app: NestFastifyApplication;

  before(async () => {
    app = await NestFactory.create<NestFastifyApplication>(
      AppModule,
      new FastifyAdapter({ logger: false }),
    );
    await app.register(fastifyCookie as any, {
      secret: 'test-session-secret-at-least-32-chars-long!',
    });
    app.useGlobalFilters(new ProblemDetailsFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  after(async () => {
    await app.close();
  });

  it('GET /bff/auth/login returns authorization URL and state when redirect=false', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/bff/auth/login?redirect=false&returnUrl=/logs',
    });

    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.body);
    assert.ok(json.authorizationUrl);
    assert.ok(json.state);
    assert.ok(json.authorizationUrl.includes('code_challenge_method=S256'));
  });

  it('GET /bff/session without cookie returns 401 Unauthorized Problem Details', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/bff/session',
    });

    assert.equal(res.statusCode, 401);
    assert.equal(res.headers['content-type'], 'application/problem+json; charset=utf-8');
    const json = JSON.parse(res.body);
    assert.equal(json.code, 'UNAUTHORIZED');
    assert.equal(json.status, 401);
  });

  it('Complete authentication lifecycle: login callback -> session -> workspace select -> logout', async () => {
    // 1. Initiate login
    const loginRes = await app.inject({
      method: 'GET',
      url: '/bff/auth/login?redirect=false&returnUrl=/logs',
    });
    const { state } = JSON.parse(loginRes.body);

    // 2. Perform callback
    const callbackRes = await app.inject({
      method: 'GET',
      url: `/bff/auth/callback?code=mock:usr_lead:architect@skyra.dev:Principal%20Architect&state=${state}`,
    });

    assert.equal(callbackRes.statusCode, 302);
    assert.equal(callbackRes.headers['location'], '/logs');

    // Extract session cookie from Set-Cookie headers
    const setCookieHeaders = callbackRes.headers['set-cookie'];
    assert.ok(setCookieHeaders);

    const cookies = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
    const sessionCookieStr = cookies.find((c: string) => c.includes('session='));
    assert.ok(sessionCookieStr, 'Session cookie must be set');
    assert.ok(sessionCookieStr.includes('HttpOnly'), 'Cookie must be HttpOnly');
    assert.ok(sessionCookieStr.includes('SameSite=Lax') || sessionCookieStr.includes('samesite=lax'), 'Cookie must have SameSite=Lax');

    const cookiePair = sessionCookieStr.split(';')[0]; // "skyra-session=..."

    // 3. Verify session
    const sessionRes = await app.inject({
      method: 'GET',
      url: '/bff/session',
      headers: {
        cookie: cookiePair,
      },
    });

    assert.equal(sessionRes.statusCode, 200);
    const sessionData = JSON.parse(sessionRes.body);
    assert.equal(sessionData.authenticated, true);
    assert.equal(sessionData.user.email, 'architect@skyra.dev');
    assert.equal(sessionData.activeTenantId, 'skyra-internal');
    assert.equal(sessionData.activeProjectId, 'skyra-tech');
    assert.ok(sessionData.csrfToken, 'CSRF token must be present');
    assert.ok(sessionData.availableTenants.length > 0);

    const csrfToken = sessionData.csrfToken;

    // 4. Test Workspace context selection with valid CSRF
    const selectRes = await app.inject({
      method: 'POST',
      url: '/bff/workspaces/select',
      headers: {
        cookie: cookiePair,
        origin: 'http://localhost:4200',
        'x-csrf-token': csrfToken,
        'content-type': 'application/json',
      },
      payload: {
        tenantId: 'skyra-internal',
        projectId: 'auth-service',
      },
    });

    assert.equal(selectRes.statusCode, 200);
    const selectData = JSON.parse(selectRes.body);
    assert.equal(selectData.activeProjectId, 'auth-service');

    // 5. Test Workspace context selection with INVALID CSRF -> 403 Forbidden
    const invalidCsrfRes = await app.inject({
      method: 'POST',
      url: '/bff/workspaces/select',
      headers: {
        cookie: cookiePair,
        origin: 'http://localhost:4200',
        'x-csrf-token': 'attacker_fake_token',
        'content-type': 'application/json',
      },
      payload: {
        tenantId: 'skyra-internal',
        projectId: 'billing-api',
      },
    });

    assert.equal(invalidCsrfRes.statusCode, 403);

    // 6. Test Workspace context selection for unauthorized foreign project -> 403 Forbidden
    const unauthProjectRes = await app.inject({
      method: 'POST',
      url: '/bff/workspaces/select',
      headers: {
        cookie: cookiePair,
        origin: 'http://localhost:4200',
        'x-csrf-token': csrfToken,
        'content-type': 'application/json',
      },
      payload: {
        tenantId: 'skyra-internal',
        projectId: 'foreign-forbidden-project',
      },
    });

    assert.equal(unauthProjectRes.statusCode, 403);

    // 7. Test Logout with valid CSRF
    const logoutRes = await app.inject({
      method: 'POST',
      url: '/bff/auth/logout',
      headers: {
        cookie: cookiePair,
        origin: 'http://localhost:4200',
        'x-csrf-token': csrfToken,
      },
    });

    assert.equal(logoutRes.statusCode, 200);
    const logoutData = JSON.parse(logoutRes.body);
    assert.equal(logoutData.success, true);

    // 8. Subsequent request with revoked session cookie fails with 401
    const postLogoutSessionRes = await app.inject({
      method: 'GET',
      url: '/bff/session',
      headers: {
        cookie: cookiePair,
      },
    });

    assert.equal(postLogoutSessionRes.statusCode, 401);
  });
});
