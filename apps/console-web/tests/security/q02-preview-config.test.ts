import '@angular/compiler';
import 'zone.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AppConfigService } from '../../src/app/core/config/app-config.service';
import { AuthService } from '../../src/app/core/auth/auth.service';
import { createEnvironmentInjector, Injector, type EnvironmentInjector } from '@angular/core';

test('Q-02: preview is opt-in and cannot be enabled for production-classified config', () => {
  const config = new AppConfigService();
  assert.equal(config.config().previewMode, false);
  assert.throws(() => config.updateConfig({ previewMode: true }), /isolated development/);
  assert.throws(() => config.updateConfig({ previewIsolation: true }), /preview mode is disabled/);
  assert.throws(() => config.updateConfig({ environment: 'production', previewMode: true, previewIsolation: true }), /isolated development/);
});

test('Q-02: production-classified config starts with no synthetic authority', () => {
  const config = new AppConfigService();
  config.updateConfig({ environment: 'production' });
  const injector: EnvironmentInjector = createEnvironmentInjector(
    [{ provide: AppConfigService, useValue: config }, AuthService],
    Injector.NULL as unknown as EnvironmentInjector,
  );
  try {
    const auth = injector.get(AuthService);
    assert.equal(auth.isAuthenticated(), false);
    assert.equal(auth.currentUser(), null);
    auth.loginPreview({ id: 'preview', email: 'preview@test.invalid', fullName: 'Preview', roles: ['OrgAdmin'], tenantId: 'tenant', allowedProjects: [] });
    assert.equal(auth.isAuthenticated(), false);
  } finally {
    injector.destroy();
  }
});

test('Q-02: changing preview settings after initialization revokes preview authority', () => {
  const config = new AppConfigService();
  config.updateConfig({ previewMode: true, previewIsolation: true, environment: 'development' });
  const injector: EnvironmentInjector = createEnvironmentInjector(
    [{ provide: AppConfigService, useValue: config }, AuthService],
    Injector.NULL as unknown as EnvironmentInjector,
  );
  try {
    const auth = injector.get(AuthService);
    auth.loginPreview({ id: 'preview', email: 'preview@test.invalid', fullName: 'Preview', roles: ['OrgAdmin'], tenantId: 'tenant', allowedProjects: [] });
    assert.equal(auth.isAuthenticated(), true);
    config.updateConfig({ previewMode: false, previewIsolation: false, environment: 'production' });
    assert.equal(auth.isAuthenticated(), false);
    assert.equal(auth.currentUser(), null);
    assert.equal(auth.isOrgAdmin(), false);
  } finally {
    injector.destroy();
  }
});
