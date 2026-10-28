import { Injectable, signal, computed } from '@angular/core';
import { PageRecord, CursorPaginationState, INITIAL_PAGINATION_STATE } from '../domain/pagination.model';

@Injectable()
export class CursorHistoryService {
  /** In-memory history stack storing past page cursors. Index 0 is Page 1 (null cursor). */
  private readonly historyStack = signal<PageRecord[]>([{ pageIndex: 1, cursor: null }]);
  private readonly currentPage = signal<number>(1);
  private readonly currentCursor = signal<string | null>(null);
  private readonly nextCursor = signal<string | null>(null);
  private readonly hasMore = signal<boolean>(false);
  private readonly pageSize = signal<number>(50);
  private readonly totalReturned = signal<number>(0);

  readonly state = computed<CursorPaginationState>(() => {
    const page = this.currentPage();
    const canPrev = page > 1;
    const canNext = this.hasMore() && this.nextCursor() !== null;

    return {
      currentPageIndex: page,
      currentCursor: this.currentCursor(),
      nextCursor: this.nextCursor(),
      hasMore: this.hasMore(),
      canPrev,
      canNext,
      pageSize: this.pageSize(),
      totalReturned: this.totalReturned(),
    };
  });

  /**
   * Resets pagination stack on filter, search text, time range, or project change.
   */
  reset(): void {
    this.historyStack.set([{ pageIndex: 1, cursor: null }]);
    this.currentPage.set(1);
    this.currentCursor.set(null);
    this.nextCursor.set(null);
    this.hasMore.set(false);
    this.totalReturned.set(0);
  }

  /**
   * Update server response metrics.
   */
  updateFromResponse(hasMore: boolean, nextCursor: string | null | undefined, totalReturned: number): void {
    this.hasMore.set(hasMore);
    this.nextCursor.set(nextCursor ?? null);
    this.totalReturned.set(totalReturned);
  }

  /**
   * Navigate forward to next page using next_cursor.
   * Returns the cursor to query.
   */
  advanceToNext(): string | null {
    const next = this.nextCursor();
    if (!next || !this.hasMore()) {
      return null;
    }

    const nextPageIndex = this.currentPage() + 1;
    this.currentPage.set(nextPageIndex);
    this.currentCursor.set(next);

    // Push into stack
    this.historyStack.update((stack) => [...stack, { pageIndex: nextPageIndex, cursor: next }]);
    return next;
  }

  /**
   * Navigate back to previous page.
   * Pops current page and returns previous cursor (null for page 1).
   */
  retreatToPrevious(): string | null {
    const stack = this.historyStack();
    if (stack.length <= 1) {
      return null;
    }

    const newStack = stack.slice(0, stack.length - 1);
    const targetRecord = newStack[newStack.length - 1];

    this.historyStack.set(newStack);
    this.currentPage.set(targetRecord.pageIndex);
    this.currentCursor.set(targetRecord.cursor);

    return targetRecord.cursor;
  }

  setPageSize(size: number): void {
    if (size > 0 && size <= 500) {
      this.pageSize.set(size);
      this.reset();
    }
  }

  getPageSize(): number {
    return this.pageSize();
  }

  getCurrentCursor(): string | null {
    return this.currentCursor();
  }
}
