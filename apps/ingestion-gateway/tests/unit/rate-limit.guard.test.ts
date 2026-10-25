import { describe, it, beforeEach } from 'node:test';
import * as assert from 'node:assert/strict';
import { RateLimitGuard } from '../../src/common/guards/rate-limit.guard.js';
import { DiagnosticsService } from '../../src/observability/diagnostics.service.js';
import { GatewayException } from '../../src/common/types/gateway-exception.js';
import { ErrorCode } from '../../src/common/types/error-code.enum.js';
import type { AuthenticatedFastifyRequest } from '../../src/auth/auth.guard.js';

describe('RateLimitGuard Unit Tests', () => {
  let guard: RateLimitGuard;
  let diagnostics: DiagnosticsService;

  beforeEach(() => {
    diagnostics = new DiagnosticsService();
    guard = new RateLimitGuard(diagnostics);
  });

  function createMockContext(request: Partial<AuthenticatedFastifyRequest>, responseHeaders: Record<string, string> = {}) {
    const reply = {
      header: (name: string, value: string) => {
        responseHeaders[name.toLowerCase()] = value;
      },
    };

    return {
      switchToHttp: () => ({
        getRequest: () => request as any,
        getResponse: () => reply as any,
      }),
    } as any;
  }

  it('should allow requests within rate limit', () => {
    const request: Partial<AuthenticatedFastifyRequest> = {
      skyraIdentity: {
        credentialId: 'cred-001',
        tenantId: 't-1',
        allowedProjects: ['*'],
        allowedEnvironments: ['*'],
        rateLimitPerMin: 5,
      },
    };

    const ctx = createMockContext(request);
    for (let i = 0; i < 5; i++) {
      assert.equal(guard.canActivate(ctx), true);
    }
  });

  it('should throw RATE_LIMIT_EXCEEDED with Retry-After header when limit exceeded', () => {
    const request: Partial<AuthenticatedFastifyRequest> = {
      skyraIdentity: {
        credentialId: 'cred-001',
        tenantId: 't-1',
        allowedProjects: ['*'],
        allowedEnvironments: ['*'],
        rateLimitPerMin: 3,
      },
    };

    const headers: Record<string, string> = {};
    const ctx = createMockContext(request, headers);

    // First 3 pass
    for (let i = 0; i < 3; i++) {
      assert.equal(guard.canActivate(ctx), true);
    }

    // 4th must fail
    assert.throws(
      () => guard.canActivate(ctx),
      (err: any) => {
        assert.ok(err instanceof GatewayException);
        assert.equal(err.code, ErrorCode.RATE_LIMIT_EXCEEDED);
        assert.equal(err.retryable, true);
        return true;
      },
    );

    assert.ok(headers['retry-after']);
    assert.equal(diagnostics.getSnapshot().rateLimitedRequests, 1);
  });
});
