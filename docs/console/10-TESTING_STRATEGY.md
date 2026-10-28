# Skyra LogHub — Web Console Testing Strategy & Quality Gates

**Document Version:** 1.0.0  
**Status:** Approved Architecture Specification  
**Task ID:** `LOGHUB-CONSOLE-001`  
**Phase:** Phase 4 — Web Console, Administration & Observability Experience  
**Date:** 2026-10-27  

---

## 1. Web Console Test Pyramid

The frontend testing strategy provides comprehensive validation across unit, integration, accessibility, and end-to-end execution layers:

```text
               ▲
              / \     Playwright E2E User Journeys
             /   \    (Authentication, Log Explorer, Drawer, Analytics)
            /─────\
           /       \   Accessibility Audits (Axe-Core / WCAG 2.2 AA)
          /         \  (Color Contrast, ARIA Landmarks, Keyboard Traversal)
         /───────────\
        /             \ API Contract & Interceptor Tests
       /               \ (OpenAPI Alignment, RFC 7807 Problem Details, Auth)
      /─────────────────\
     /                   \ Signal Facade & Component Unit Tests
    /                     \ (Signal Computations, State Reducers, DOM Output)
   └───────────────────────┘
```

---

## 2. Testing Layers & Responsibilities

### 2.1 Unit Tests (Components & UI Controls)
- **Scope:** Isolated dumb components in `shared/ui/` (Badges, Buttons, JSON viewer, Tables).
- **Invariants Verified:**
  - Signal `input()` changes trigger precise DOM updates without full tree re-renders.
  - Event clicks emit expected Signal `output()` values.
  - Severity badges render correct CSS classes and accessible text for all 7 ECS levels.
  - Zero raw HTML injections when rendering log messages with `<script>` tags.

### 2.2 Facade & State Tests
- **Scope:** Feature facades in `features/*/services/`.
- **Invariants Verified:**
  - `LogExplorerFacade` accurately pushes and pops signed HMAC cursors when navigating pages.
  - Debounced search filter updates cancel previous in-flight requests.
  - HTTP 429 errors set `isRateLimited` signal and populate retry cooldown countdown.
  - Switching active projects clears previous search results to prevent cross-project flashes.

### 2.3 HTTP Client & Interceptor Integration Tests
- **Scope:** `core/api/` and `core/auth/`.
- **Invariants Verified:**
  - `QueryApiClient` generates requests strictly adhering to `contracts/query/v1/search-request.schema.json`.
  - Functional `authInterceptorFn` appends `Authorization: Bearer <token>` and `X-Request-ID`.
  - Non-2xx responses correctly deserialize into typed `ProblemDetailsDto`.

### 2.4 Automated Accessibility Testing (Axe-Core)
- **Scope:** Automated DOM scanning integrated into E2E test runs.
- **Rules Enforced:**
  - Zero WCAG 2.2 AA violations on all primary screens.
  - Contrast ratios $\ge 4.5:1$ across both Light and Dark themes.
  - All form controls have associated `<label>` or `aria-label`.
  - Full keyboard operability (Tab order, Enter, Space, Escape, Arrow keys).

### 2.5 End-to-End User Journeys (Playwright)
- **Journey 1 (Incident Investigation):** User logs in $\rightarrow$ opens Log Explorer $\rightarrow$ filters by `service:auth-service` and `level:error` $\rightarrow$ inspects event in drawer $\rightarrow$ copies Event ID to clipboard.
- **Journey 2 (Cursor Pagination):** User loads 50 records $\rightarrow$ clicks "Next Page" $\rightarrow$ verifies cursor parameter in URL $\rightarrow$ verifies page 2 records load gaplessly $\rightarrow$ clicks "Previous Page" to return.
- **Journey 3 (Unauthorized Project Access):** User enters URL scoping an unauthorized project $\rightarrow$ Query Service responds 403 $\rightarrow$ UI renders safe access-denied state with navigation button back to permitted projects.

---

## 3. Frontend Quality Gates & Verified Status (LOGHUB-CONSOLE-005)

All quality gates were executed and passed with 100% success rate:

1. **Strict Angular Typecheck:** `pnpm --filter @skyra/console-web typecheck` passed with **0 errors**.
2. **Production AOT Build:** `pnpm --filter @skyra/console-web build` passed cleanly in **14.5s** with zero circular dependencies.
3. **Console Web Test Suites:** `pnpm --filter @skyra/console-web test` executed **67/67 passing tests across 16 suites** (including `analytics.mapper.test.ts`, `analytics.facade.test.ts`, `metric-card.test.ts`, `time-series-chart.test.ts`, `severity-chart.test.ts`, `cursor-history.service.test.ts`, `filter-state.service.test.ts`, `json-inspector.test.ts`, and `log-explorer.facade.test.ts`).
4. **BFF Integration & Query Proxy Test Suites:** `pnpm test:bff` executed **52/52 passing tests across 6 suites** (including 9 tests in `bff-query-proxy.test.ts` validating internal JWT forwarding, cross-tenant denial, RFC 7807 problem details, and batch aggregation proxying).
5. **Contract Test Suites:** `pnpm test:contracts` executed **45/45 passing tests across 4 suites**.
6. **Query Service Test Suites:** `pnpm test:query` executed **210/210 passing tests across 35 suites**.
7. **Full Monorepo Regression Gate:** `pnpm test` executed **748/748 passing tests across 118 suites** with 0 failures.
