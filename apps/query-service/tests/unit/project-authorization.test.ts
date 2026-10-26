import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { ProjectAuthorizationService } from '../../src/modules/auth/authorization/project-authorization.service.js';
import type { QueryPrincipal } from '../../src/modules/auth/domain/principal.model.js';
import {
  ForbiddenProjectException,
  CrossTenantViolationException,
} from '../../src/common/errors/query.errors.js';

describe('ProjectAuthorizationService Unit Tests (LOGHUB-QUERY-002)', () => {
  const service = new ProjectAuthorizationService();

  const standardPrincipal: QueryPrincipal = {
    sub: 'user-42',
    tenantId: 'tenant-acme',
    authorizedProjects: ['billing', 'auth-service', 'web-app'],
    allowedEnvironments: ['production', 'development'],
    roles: ['viewer'],
    iss: 'https://auth.skyra.internal',
    aud: 'skyra-loghub-query',
    exp: Math.floor(Date.now() / 1000) + 3600,
  };

  const wildcardPrincipal: QueryPrincipal = {
    sub: 'admin-1',
    tenantId: 'tenant-acme',
    authorizedProjects: ['*'],
    allowedEnvironments: ['production', 'staging', 'development'],
    roles: ['admin'],
    iss: 'https://auth.skyra.internal',
    aud: 'skyra-loghub-query',
    exp: Math.floor(Date.now() / 1000) + 3600,
  };

  it('should return all allowed projects when no specific projects requested', async () => {
    const scope = await service.resolveAuthorizedProjects(standardPrincipal, undefined, 'tenant-acme');
    assert.deepEqual(scope.effectiveProjects.slice().sort(), ['auth-service', 'billing', 'web-app'].sort());
    assert.equal(scope.isWildcard, false);
  });

  it('should allow subset of permitted projects', async () => {
    const scope = await service.resolveAuthorizedProjects(standardPrincipal, ['billing', 'web-app'], 'tenant-acme');
    assert.deepEqual(scope.effectiveProjects.slice().sort(), ['billing', 'web-app'].sort());
  });

  it('should reject access when requested project is not in allowed list', async () => {
    await assert.rejects(
      () => service.resolveAuthorizedProjects(standardPrincipal, ['billing', 'secret-payroll'], 'tenant-acme'),
      (err: unknown) => {
        assert.ok(err instanceof ForbiddenProjectException);
        assert.match((err as ForbiddenProjectException).message, /secret-payroll/);
        return true;
      },
    );
  });

  it('should allow any requested project for wildcard principal', async () => {
    const scope = await service.resolveAuthorizedProjects(wildcardPrincipal, ['secret-payroll', 'internal-service'], 'tenant-acme');
    assert.deepEqual(scope.effectiveProjects.slice().sort(), ['internal-service', 'secret-payroll'].sort());
  });

  it('should throw CrossTenantViolationException when tenantId does not match principal tenant', async () => {
    await assert.rejects(
      () => service.resolveAuthorizedProjects(standardPrincipal, ['billing'], 'other-tenant-xyz'),
      (err: unknown) => {
        assert.ok(err instanceof CrossTenantViolationException);
        return true;
      },
    );
  });
});
