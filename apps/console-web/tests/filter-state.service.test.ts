import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { FilterStateService } from '../src/app/features/log-explorer/application/filter-state.service';
import { resolveTimeRange } from '../src/app/features/log-explorer/domain/log-search.model';

describe('FilterStateService — Structured Criteria, Chips & Time Boundaries', () => {
  it('1. Initializes with empty query, 15m preset, and no active chips', () => {
    const service = new FilterStateService();

    assert.equal(service.queryText(), '');
    assert.equal(service.timeRangePreset(), '15m');
    assert.equal(service.selectedLevels().length, 0);
    assert.equal(service.filterChips().length, 0);
    assert.equal(service.hasActiveFilters(), false);
  });

  it('2. Calculates chips reactively when filters are applied', () => {
    const service = new FilterStateService();

    service.setQueryText('timeout error');
    service.toggleLevel('error');
    service.toggleService('auth-service');
    service.toggleEnvironment('production');

    assert.equal(service.hasActiveFilters(), true);

    const chips = service.filterChips();
    assert.equal(chips.length, 4);

    const categories = chips.map((c) => c.category);
    assert.ok(categories.includes('query'));
    assert.ok(categories.includes('level'));
    assert.ok(categories.includes('service'));
    assert.ok(categories.includes('environment'));
  });

  it('3. Removes individual chips properly', () => {
    const service = new FilterStateService();
    service.setQueryText('payment');
    service.toggleLevel('fatal');

    const chips = service.filterChips();
    const queryChip = chips.find((c) => c.category === 'query')!;
    service.removeChip(queryChip);

    assert.equal(service.queryText(), '');
    assert.equal(service.selectedLevels().includes('fatal'), true);

    const levelChip = service.filterChips().find((c) => c.category === 'level')!;
    service.removeChip(levelChip);
    assert.equal(service.selectedLevels().length, 0);
  });

  it('4. Clears all filters and resets time range to 15m', () => {
    const service = new FilterStateService();
    service.setQueryText('database deadlock');
    service.toggleLevel('error');
    service.setTimeRange('24h');

    service.clearAllFilters();

    assert.equal(service.queryText(), '');
    assert.equal(service.selectedLevels().length, 0);
    assert.equal(service.timeRangePreset(), '15m');
    assert.equal(service.filterChips().length, 0);
    assert.equal(service.hasActiveFilters(), false);
  });

  it('5. Produces contract-valid LogSearchCriteria', () => {
    const service = new FilterStateService();
    service.setQueryText('connection refused');
    service.toggleLevel('warn');
    service.toggleService('ingress-gateway');

    const criteria = service.getCriteria(50);
    assert.equal(criteria.queryText, 'connection refused');
    assert.deepEqual(criteria.levels, ['warn']);
    assert.deepEqual(criteria.services, ['ingress-gateway']);
    assert.equal(criteria.limit, 50);
  });

  it('6. Resolves UTC time boundaries strictly ending in Z', () => {
    const fixedNow = 1700000000000; // Fixed timestamp
    const res = resolveTimeRange('1h', undefined, undefined, fixedNow);

    assert.ok(res.start.endsWith('Z'));
    assert.ok(res.end.endsWith('Z'));

    const startMs = Date.parse(res.start);
    const endMs = Date.parse(res.end);
    assert.equal(endMs - startMs, 3600000); // exactly 1 hour
  });
});
