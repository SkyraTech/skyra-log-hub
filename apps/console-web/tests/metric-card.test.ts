import '@angular/compiler';
import 'zone.js';
import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { runInInjectionContext, createEnvironmentInjector, Injector } from '@angular/core';
import { MetricCardComponent } from '../src/app/features/analytics/components/metric-card/metric-card.component';

describe('MetricCardComponent Unit Tests (LOGHUB-CONSOLE-005)', () => {
  it('MC-1: Correctly instantiates and computes formatted numbers', () => {
    const envInjector = createEnvironmentInjector([], Injector.NULL as unknown as Injector);
    runInInjectionContext(envInjector, () => {
      const comp = new MetricCardComponent();
      (comp as any).label = () => 'Total Ingested Events';
      (comp as any).value = () => 1429810;
      (comp as any).unit = () => 'logs';

      assert.equal(comp.formattedValue(), '1,429,810');
      assert.equal(comp.ariaLabel(), 'Total Ingested Events: 1429810 logs');
    });
  });

  it('MC-2: Emits cardClick when isClickable is true', () => {
    const envInjector = createEnvironmentInjector([], Injector.NULL as unknown as Injector);
    runInInjectionContext(envInjector, () => {
      const comp = new MetricCardComponent();
      (comp as any).label = () => 'Exceptions';
      (comp as any).value = () => 42;
      (comp as any).isClickable = () => true;

      let clicked = false;
      comp.cardClick.subscribe(() => {
        clicked = true;
      });

      comp.onClick();
      assert.equal(clicked, true);
    });
  });
});
