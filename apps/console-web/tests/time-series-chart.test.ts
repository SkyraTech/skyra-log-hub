import '@angular/compiler';
import 'zone.js';
import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { runInInjectionContext, createEnvironmentInjector, Injector } from '@angular/core';
import { TimeSeriesChartComponent } from '../src/app/features/analytics/components/time-series-chart/time-series-chart.component';
import { TimeSeriesPoint } from '../src/app/features/analytics/domain/analytics-metric.model';

describe('TimeSeriesChartComponent Unit Tests (LOGHUB-CONSOLE-005)', () => {
  const MOCK_POINTS: TimeSeriesPoint[] = [
    {
      timestamp: '2026-10-28T04:00:00.000Z',
      count: 100,
      formattedTime: '04:00',
      formattedDate: '2026-10-28',
    },
    {
      timestamp: '2026-10-28T05:00:00.000Z',
      count: 400,
      formattedTime: '05:00',
      formattedDate: '2026-10-28',
    },
    {
      timestamp: '2026-10-28T06:00:00.000Z',
      count: 200,
      formattedTime: '06:00',
      formattedDate: '2026-10-28',
    },
  ];

  it('TSC-1: Computes maxCount and bar dimensions proportionally', () => {
    const envInjector = createEnvironmentInjector([], Injector.NULL as unknown as Injector);
    runInInjectionContext(envInjector, () => {
      const comp = new TimeSeriesChartComponent();
      (comp as any).points = () => MOCK_POINTS;

      assert.equal(comp.maxCount(), 400);
      assert.equal(comp.maxCountFormatted(), '400');
      assert.equal(comp.midCountFormatted(), '200');

      const bars = comp.bars();
      assert.equal(bars.length, 3);

      // Max bar (idx 1, count 400) should have full height 150
      assert.equal(bars[1].height, 150);
      assert.equal(bars[1].y, 20); // 170 - 150

      // Bar 0 (count 100) should have height 150 * (100 / 400) = 37.5
      assert.equal(bars[0].height, 37.5);
      assert.equal(bars[0].y, 132.5);
    });
  });

  it('TSC-2: Emits bucketClick when a point is selected', () => {
    const envInjector = createEnvironmentInjector([], Injector.NULL as unknown as Injector);
    runInInjectionContext(envInjector, () => {
      const comp = new TimeSeriesChartComponent();
      (comp as any).points = () => MOCK_POINTS;

      let selectedPoint: TimeSeriesPoint | null = null;
      comp.bucketClick.subscribe((pt) => {
        selectedPoint = pt;
      });

      comp.onPointSelect(MOCK_POINTS[1]);
      assert.equal(selectedPoint?.timestamp, '2026-10-28T05:00:00.000Z');
      assert.equal(selectedPoint?.count, 400);
    });
  });

  it('TSC-3: Toggles accessible tabular view', () => {
    const envInjector = createEnvironmentInjector([], Injector.NULL as unknown as Injector);
    runInInjectionContext(envInjector, () => {
      const comp = new TimeSeriesChartComponent();
      assert.equal(comp.showTable(), false);

      comp.toggleTable();
      assert.equal(comp.showTable(), true);

      comp.toggleTable();
      assert.equal(comp.showTable(), false);
    });
  });
});
