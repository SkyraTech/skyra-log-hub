import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { CursorHistoryService } from '../src/app/features/log-explorer/application/cursor-history.service';

describe('CursorHistoryService — Signed Keyset Pagination Stack', () => {
  it('1. Initializes with Page 1, null cursor, and canPrev = false', () => {
    const service = new CursorHistoryService();
    const state = service.state();

    assert.equal(state.currentPageIndex, 1);
    assert.equal(state.currentCursor, null);
    assert.equal(state.nextCursor, null);
    assert.equal(state.canPrev, false);
    assert.equal(state.canNext, false);
    assert.equal(state.pageSize, 50);
  });

  it('2. Updates state when response contains next_cursor and has_more = true', () => {
    const service = new CursorHistoryService();
    service.updateFromResponse(true, 'signed_cursor_page_2', 50);
    const state = service.state();

    assert.equal(state.hasMore, true);
    assert.equal(state.nextCursor, 'signed_cursor_page_2');
    assert.equal(state.canNext, true);
    assert.equal(state.canPrev, false);
    assert.equal(state.totalReturned, 50);
  });

  it('3. Advances to next page and updates history stack', () => {
    const service = new CursorHistoryService();
    service.updateFromResponse(true, 'cursor_p2', 50);

    const advancedCursor = service.advanceToNext();
    assert.equal(advancedCursor, 'cursor_p2');

    const state = service.state();
    assert.equal(state.currentPageIndex, 2);
    assert.equal(state.currentCursor, 'cursor_p2');
    assert.equal(state.canPrev, true);
  });

  it('4. Navigates backward across multi-page history stack', () => {
    const service = new CursorHistoryService();

    // Page 1 -> receives p2 cursor
    service.updateFromResponse(true, 'cursor_p2', 50);
    service.advanceToNext();

    // Page 2 -> receives p3 cursor
    service.updateFromResponse(true, 'cursor_p3', 50);
    service.advanceToNext();

    assert.equal(service.state().currentPageIndex, 3);
    assert.equal(service.state().currentCursor, 'cursor_p3');

    // Retreat to Page 2
    const p2Cursor = service.retreatToPrevious();
    assert.equal(p2Cursor, 'cursor_p2');
    assert.equal(service.state().currentPageIndex, 2);
    assert.equal(service.state().canPrev, true);

    // Retreat to Page 1
    const p1Cursor = service.retreatToPrevious();
    assert.equal(p1Cursor, null);
    assert.equal(service.state().currentPageIndex, 1);
    assert.equal(service.state().canPrev, false);
  });

  it('5. Resets cursor stack when search filter, time range, or project changes', () => {
    const service = new CursorHistoryService();
    service.updateFromResponse(true, 'cursor_p2', 50);
    service.advanceToNext();

    assert.equal(service.state().currentPageIndex, 2);

    service.reset();
    const state = service.state();
    assert.equal(state.currentPageIndex, 1);
    assert.equal(state.currentCursor, null);
    assert.equal(state.nextCursor, null);
    assert.equal(state.canPrev, false);
    assert.equal(state.canNext, false);
  });

  it('6. Page size adjustment resets cursor and enforces bounds', () => {
    const service = new CursorHistoryService();
    service.updateFromResponse(true, 'cursor_p2', 50);
    service.advanceToNext();

    service.setPageSize(100);
    assert.equal(service.getPageSize(), 100);
    assert.equal(service.state().currentPageIndex, 1);
    assert.equal(service.state().currentCursor, null);

    // Ignore invalid sizes
    service.setPageSize(0);
    assert.equal(service.getPageSize(), 100);
    service.setPageSize(600);
    assert.equal(service.getPageSize(), 100);
  });

  it('7. advanceToNext returns null when hasMore is false or nextCursor is null', () => {
    const service = new CursorHistoryService();
    service.updateFromResponse(false, null, 12);

    const cursor = service.advanceToNext();
    assert.equal(cursor, null);
    assert.equal(service.state().currentPageIndex, 1);
  });
});
