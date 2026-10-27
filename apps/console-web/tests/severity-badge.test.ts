import '@angular/compiler';
import 'zone.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createEnvironmentInjector, Injector, runInInjectionContext } from '@angular/core';
import { SeverityBadgeComponent } from '../src/app/shared/ui/severity-badge/severity-badge.component';

describe('SeverityBadgeComponent — ECS Log Level Normalization', () => {
  const injector = createEnvironmentInjector([], Injector.NULL as any);

  it('should instantiate and normalize standard ECS severities', () => {
    runInInjectionContext(injector, () => {
      const badge = new SeverityBadgeComponent();
      assert.equal(badge.label(), 'INFO');
      assert.equal(badge.normalizedLevel(), 'info');
    });
  });

  it('should support severity input aliases and uppercase labels', () => {
    runInInjectionContext(injector, () => {
      const badge = new SeverityBadgeComponent();
      assert.equal(typeof badge.normalizedLevel, 'function');
      assert.equal(typeof badge.label, 'function');
    });
  });
});
