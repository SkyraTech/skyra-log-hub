import '@angular/compiler';
import 'zone.js';
import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { runInInjectionContext, createEnvironmentInjector, Injector } from '@angular/core';
import { SeverityChartComponent } from '../src/app/features/analytics/components/severity-chart/severity-chart.component';
import { DistributionItem } from '../src/app/features/analytics/domain/analytics-metric.model';

describe('SeverityChartComponent Unit Tests (LOGHUB-CONSOLE-005)', () => {
  const MOCK_ITEMS: DistributionItem[] = [
    { key: 'info', label: 'info', count: 300, percentage: 75, color: '#2563EB' },
    { key: 'error', label: 'error', count: 100, percentage: 25, color: '#DC2626' },
  ];

  it('SC-1: Instantiates with distribution items and emits levelClick', () => {
    const envInjector = createEnvironmentInjector([], Injector.NULL as unknown as Injector);
    runInInjectionContext(envInjector, () => {
      const comp = new SeverityChartComponent();
      (comp as any).items = () => MOCK_ITEMS;

      let selectedLevel: string | null = null;
      comp.levelClick.subscribe((lvl) => {
        selectedLevel = lvl;
      });

      comp.onItemClick('error');
      assert.equal(selectedLevel, 'error');
    });
  });
});
