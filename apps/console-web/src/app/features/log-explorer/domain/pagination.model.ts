export interface PageRecord {
  pageIndex: number;
  cursor: string | null;
}

export interface CursorPaginationState {
  currentPageIndex: number;
  currentCursor: string | null;
  nextCursor: string | null;
  hasMore: boolean;
  canPrev: boolean;
  canNext: boolean;
  pageSize: number;
  totalReturned: number;
}

export const INITIAL_PAGINATION_STATE: CursorPaginationState = {
  currentPageIndex: 1,
  currentCursor: null,
  nextCursor: null,
  hasMore: false,
  canPrev: false,
  canNext: false,
  pageSize: 50,
  totalReturned: 0,
};
