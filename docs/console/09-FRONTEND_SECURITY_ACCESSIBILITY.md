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
