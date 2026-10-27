import '@angular/compiler';
import 'zone.js';
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createEnvironmentInjector, EnvironmentInjector, Injector } from '@angular/core';
import { AuthService } from '../src/app/core/auth/auth.service';
import { AppConfigService } from '../src/app/core/config/app-config.service';

describe('AuthService — BFF Session & RBAC Capability Evaluation', () => {
  let injector: EnvironmentInjector;
  let authService: AuthService;

  beforeEach(() => {
    injector = createEnvironmentInjector([AppConfigService, AuthService], Injector.NULL as unknown as EnvironmentInjector);
    authService = injector.get(AuthService);
  });

  it('should initialize with dev preview session active', () => {
    assert.equal(authService.isAuthenticated(), true);
    assert.equal(authService.isPreviewSession(), true);
    assert.equal(authService.currentUser()?.fullName, 'Alex Vance');
    assert.equal(authService.isOrgAdmin(), true);
    assert.equal(authService.isDeveloper(), true);
  });

  it('should evaluate role capabilities accurately', () => {
    assert.equal(authService.hasRole('OrgAdmin'), true);
    assert.equal(authService.hasRole('Developer'), true);
    assert.equal(authService.hasRole('Viewer'), false);
  });

  it('should clear session upon logout', () => {
    authService.logout();
    assert.equal(authService.isAuthenticated(), false);
    assert.equal(authService.currentUser(), null);
    assert.equal(authService.isPreviewSession(), false);
    assert.equal(authService.isOrgAdmin(), false);
    assert.equal(authService.isDeveloper(), false);
  });

  it('should allow login with custom user profile', () => {
    authService.loginPreview({
      id: 'usr-analyst-01',
      email: 'analyst@skyra-tech.com',
      fullName: 'Data Analyst',
      roles: ['Viewer'],
      tenantId: 'tenant-demo',
      allowedProjects: ['skyra-tech'],
    });

    assert.equal(authService.isAuthenticated(), true);
    assert.equal(authService.currentUser()?.fullName, 'Data Analyst');
    assert.equal(authService.hasRole('Viewer'), true);
    assert.equal(authService.isOrgAdmin(), false);
  });
});
