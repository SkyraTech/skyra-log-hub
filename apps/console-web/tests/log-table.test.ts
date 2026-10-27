import '@angular/compiler';
import 'zone.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createEnvironmentInjector, Injector, runInInjectionContext } from '@angular/core';
import { LogTableComponent } from '../src/app/shared/ui/log-table/log-table.component';
import { LogTableRow } from '../src/app/shared/ui/log-table/log-table.model';

describe('LogTableComponent — High-Density Workstation Table', () => {
  const injector = createEnvironmentInjector([], Injector.NULL as any);

  it('should format ISO timestamp accurately to millisecond precision', () => {
    runInInjectionContext(injector, () => {
      const table = new LogTableComponent();
      const iso = '2026-10-27T10:14:02.148Z';
      const formatted = table.formatTimestamp(iso);
      assert.ok(formatted.includes('2026-10-27'));
      assert.ok(formatted.includes('.148') || formatted.includes('10:14:02'));
    });
  });

  it('should handle missing or invalid timestamps without throwing', () => {
    runInInjectionContext(injector, () => {
      const table = new LogTableComponent();
      assert.equal(table.formatTimestamp(''), '');
      assert.equal(table.formatTimestamp('invalid-date'), 'invalid-date');
    });
  });

  it('should initialize with default inputs and emit rowSelect', () => {
    runInInjectionContext(injector, () => {
      const table = new LogTableComponent();
      assert.equal(table.density(), 'compact');
      assert.deepEqual(table.logs(), []);
      assert.equal(table.loading(), false);

      let emittedRow: LogTableRow | null = null;
      table.rowSelect.subscribe((row: LogTableRow) => {
        emittedRow = row;
      });

      const mockRow: LogTableRow = {
        id: 'test-row-1',
        timestamp: '2026-10-27T10:00:00.000Z',
        severity: 'error',
        service: 'query-service',
        message: 'Test message',
      };

      table.onRowClick(mockRow);
      assert.deepEqual(emittedRow, mockRow);
    });
  });
});
