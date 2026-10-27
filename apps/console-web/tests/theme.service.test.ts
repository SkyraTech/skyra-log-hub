import '@angular/compiler';
import 'zone.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createEnvironmentInjector, EnvironmentInjector, Injector, PLATFORM_ID } from '@angular/core';
import { ThemeService } from '../src/app/core/theme/theme.service';

describe('ThemeService — Light, Dark, System Theme Signal Management', () => {
  it('should initialize with default dark theme in server/test platform', () => {
    const injector = createEnvironmentInjector(
      [
        ThemeService,
        { provide: PLATFORM_ID, useValue: 'server' },
      ],
      Injector.NULL as unknown as EnvironmentInjector
    );
    const service = injector.get(ThemeService);

    assert.equal(service.themeMode(), 'dark');
    assert.equal(service.resolvedTheme(), 'dark');
  });

  it('should toggle theme from dark to light and back', () => {
    const injector = createEnvironmentInjector(
      [
        ThemeService,
        { provide: PLATFORM_ID, useValue: 'server' },
      ],
      Injector.NULL as unknown as EnvironmentInjector
    );
    const service = injector.get(ThemeService);

    service.setTheme('light');
    assert.equal(service.themeMode(), 'light');

    service.setTheme('dark');
    assert.equal(service.themeMode(), 'dark');

    service.setTheme('system');
    assert.equal(service.themeMode(), 'system');
  });
});
