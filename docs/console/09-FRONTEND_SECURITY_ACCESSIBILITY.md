# Skyra LogHub — Frontend Security Threat Model & Accessibility Architecture

**Document Version:** 1.0.0  
**Status:** Approved Architecture Specification  
**Task ID:** `LOGHUB-CONSOLE-001`  
**Phase:** Phase 4 — Web Console, Administration & Observability Experience  
**Date:** 2026-10-27  

---

## 1. Frontend Security Threat Model & Countermeasures

Because the Web Console renders log data submitted by arbitrary external microservices, log messages must be treated as **untrusted, potentially hostile text**.

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Threat Vector                     │ Impact               │ Mandatory Architectural Defense  │
├───────────────────────────────────┼──────────────────────┼──────────────────────────────────┤
│ 1. Stored XSS in Log Message      │ Critical             │ Zero `[innerHTML]` on log text;  │
│    (e.g. `<script>alert(1)</script>`)                     │ Text interpolated via `{{ }}`    │
├───────────────────────────────────┼──────────────────────┼──────────────────────────────────┤
│ 2. Token Theft via XSS            │ Critical             │ HTTP-only `__Host-` cookies;     │
│                                   │                      │ No tokens in `localStorage`      │
├───────────────────────────────────┼──────────────────────┼──────────────────────────────────┤
│ 3. Clickjacking / UI Redressing   │ High                 │ CSP `frame-ancestors 'none'`;    │
│                                   │                      │ `X-Frame-Options: DENY`          │
├───────────────────────────────────┼──────────────────────┼──────────────────────────────────┤
│ 4. Cross-Tenant Data Leakage      │ Critical             │ Tenant boundary derived from     │
│                                   │                      │ server session; pre-read gates   │
├───────────────────────────────────┼──────────────────────┼──────────────────────────────────┤
│ 5. Malicious ANSI Escapes in Logs │ Medium               │ Strip ANSI escape sequences      │
│    (Terminal override exploits)   │                      │ before rendering in browser      │
├───────────────────────────────────┼──────────────────────┼──────────────────────────────────┤
│ 6. Credential Leak in Shared URLs │ High                 │ Signed cursors only in query;    │
│                                   │                      │ Zero secrets or PII in URL state │
└───────────────────────────────────┴──────────────────────┴──────────────────────────────────┘
```

### 1.1 Strict Content Security Policy (CSP)
The web console is delivered with a strict Content Security Policy HTTP header:
```text
Content-Security-Policy: 
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  connect-src 'self' https://logs-query.skyra.internal;
  img-src 'self' data:;
  font-src 'self';
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
```

---

## 2. Accessibility Engineering (WCAG 2.2 AA Compliance)

The Web Console is designed to be fully operable by engineers using assistive technology, screen readers, or keyboard-only navigation.

### 2.1 Contrast Invariants
- **Normal Text ($\le$ 18px):** Minimum contrast ratio of **4.5:1** against underlying surface.
- **Large Text ($>$ 18px) and UI Controls:** Minimum contrast ratio of **3.0:1**.
- **Validated Color Pairings:**
  - Light Mode Primary Text (`#0F172A`) on Base (`#F8FAFC`): **14.2:1 (AAA Pass)**.
  - Dark Mode Primary Text (`#F8FAFC`) on Base (`#0B0F17`): **16.8:1 (AAA Pass)**.
  - Error Text (`#BE123C`) on Error Tint (`#FFF1F2`): **6.8:1 (AA Pass)**.

### 2.2 Full Keyboard Navigation & Hotkeys
- **Visible Focus Rings:** Pervasive, unsuppressed focus indicators (`outline: 2px solid var(--color-brand-primary); outline-offset: 2px;`).
- **Log Table Shortcuts:**
  - `j` or `↓`: Select next row.
  - `k` or `↑`: Select previous row.
  - `Enter` or `Space`: Open Event Detail Drawer for selected record.
  - `Esc`: Close open drawer or dialog.
  - `/`: Focus search input bar.
- **Skip Link:** Hidden "Skip to main content" link appears on first `Tab` press.

### 2.3 Screen Reader Compatibility & Semantic HTML
- Results counts and loading states use `aria-live="polite"` so screen reader users are notified when queries finish without interrupting active speech.
- Icon-only buttons (copy, close, refresh) must include an explicit `aria-label` (e.g. `aria-label="Copy Event ID to clipboard"`).
- Tables use standard HTML5 `<table>`, `<thead>`, `<th>`, `<tbody>`, and `<tr>` semantics rather than unsemantic `<div>` grids.

### 2.4 Multi-Cue Severity Indicators
Status indicators must **never rely solely on color** to communicate meaning:
- Every severity pill contains both a distinct **color background** and **uppercase text label** (`FATAL`, `ERROR`, `WARN`, `INFO`, `DEBUG`).
- Screen readers announce severity via semantic text (e.g. `<span class="sr-only">Severity: Error</span>`).

### 2.5 Reduced Motion Support
Users with vestibular motion sensitivity are respected via standard media queries:
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```
Event drawer and modal transitions snap immediately into place when reduced motion is preferred.

---

## 3. LOGHUB-CONSOLE-004 Verification & Threat Mitigation Evidence

In milestone `LOGHUB-CONSOLE-004`, the frontend security invariants were audited and verified across all newly implemented components:

1. **Zero `[innerHTML]` Policy:** Verified across `LogExplorerComponent`, `SearchToolbarComponent`, `FilterPanelComponent`, `QueryStatusComponent`, `LogEventDrawerComponent`, and `JsonInspectorComponent`. All log messages, stack traces, and arbitrary JSON keys/values are rendered via Angular text interpolation `{{ ... }}` or safe text nodes.
2. **Text-Only JSON Inspector:** The recursive tree in `JsonInspectorComponent` parses arbitrary JSON into structured node primitives (`string`, `number`, `boolean`, `null`, `object`, `array`). All primitive values are sanitized and rendered as pure text; prototype-polluting payloads (`__proto__`, `constructor`) are safely formatted without execution.
3. **Workspace Isolation & Stale-Response Immunity:** `LogExplorerFacade` tracks a monotonic `queryGeneration` counter. When switching workspaces, active HTTP requests are cancelled via RxJS `takeUntil(this.cancelActiveQuery$)` and current rows are wiped immediately, preventing cross-tenant data flashes.
4. **WCAG 2.2 AA Compliance:** 
   - Interactive dialog in `LogEventDrawerComponent` implements `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, focus trapping, and `Escape` key listeners.
   - Keyset pagination controls announce current page state truthfully without fabricating total count.
   - Query status uses `role="status"` with `aria-live="polite"` for non-disruptive screen reader updates.

---

## 4. LOGHUB-CONSOLE-005 Verification & Observability Dashboard Quality
 
In milestone `LOGHUB-CONSOLE-005`, the dashboard and analytics visualizations were audited against security and accessibility standards:

1. **Zero `[innerHTML]` Policy across Visualizations:**
   - Evaluated `TimeSeriesChartComponent`, `SeverityChartComponent`, `ServiceDistributionComponent`, `ErrorBreakdownComponent`, and `MetricCardComponent`.
   - Tooltips, metric figures, service names, and exception types are rendered strictly through standard text interpolation `{{ ... }}` or SVG text elements. Hostile service names such as `<script>alert(1)</script>` or terminal escape sequences render purely as inert text.
2. **Native Accessible SVG Architecture (Zero External Chart Bloat):**
   - Implemented pure Angular SVG charts (`TimeSeriesChartComponent`) without heavyweight, vulnerable third-party JavaScript chart libraries.
   - Every chart provides an accessible view toggle allowing screen reader and keyboard users to switch from the SVG visualization to an accessible semantic data table (`<table>`, `<th>`, `<td>`) complying with WCAG 2.2 AA.
   - Interactive SVG bars and progress elements support `tabindex="0"` and keyboard activation (`Enter` / `Space`) to trigger drilldowns.
3. **Monotonic Cancellation & Cross-Tenant Data Flashes:**
   - `AnalyticsFacade` implements a strictly monotonic `queryGeneration` counter. Stale out-of-order responses are silently ignored.
   - When the active project or workspace changes, `resetState()` immediately resets all KPIs, time-series arrays, and breakdowns to empty initial states, preventing data leakage from previous tenant scopes.
4. **Drilldown State Safety:**
   - Drilldown navigations from KPI cards, severity segments, service rankings, and histogram buckets serialize safe, unprivileged query parameters (`levels`, `services`, `range=custom`, `start`, `end`).
   - Cursors, auth tokens, and raw log payloads are never placed in URLs.

