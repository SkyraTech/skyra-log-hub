# Design System and UX Specification

> **Product:** Skyra LogHub  |  **Status:** Proposed baseline — review before implementation  |  **Version:** 0.1-draft  |  **Date:** 2026-10-21
> **Repository:** `skyra-loghub` (renamed by project owner). Assumptions and undecided items are marked **TBD**. These documents are design specifications, not assertions that code already exists.

## 1. Product experience
A premium, professional, high-density but readable **developer observability workstation**. Familiar Discover-style capabilities, original Skyra Tech styling (do not copy Kibana brand/trade dress). Optimize searching, comparing, correlating and investigating rather than decorative landing pages.

## 2. UI source of truth
Use published `@skyra-tech-platform/*` design tokens, app shell, data table, form fields, dialog, notification, date-time and buttons as first choice. **Exact branding palette currently TBD**: do not falsely treat example colors below as company-approved; obtain approved Skyra Tech brand identity before final styling. LogHub-only component tokens may extend—not conflict with—shared tokens.

## 3. Proposed semantic tokens (subject to approval)
| Token | Light suggestion | Dark suggestion | Usage |
|---|---|---|---|
| `--lh-bg` | `#F7F9FC` | `#10151F` | Main background |
| `--lh-surface` | `#FFFFFF` | `#182130` | Cards/panels |
| `--lh-text` | `#182235` | `#EAF0F9` | Primary text |
| `--lh-muted` | `#5D6B80` | `#A3B2C6` | Secondary text |
| `--lh-accent` | `#2563EB` | `#60A5FA` | Primary actions/focus |
| `--lh-border` | `#DDE3EC` | `#334155` | Dividers |
| `--lh-danger` | `#B42318` | `#FB7185` | Errors |
| `--lh-warning` | `#B45309` | `#FBBF24` | Warnings |
| `--lh-success` | `#067647` | `#34D399` | Healthy |
Ensure WCAG 2.2 AA text/focus contrast before approval; status requires icon/text, not only color.

## 4. Typography, spacing and sizing
- Use Skyra Platform typography tokens where present; fallback `Inter, system-ui, sans-serif`; monospace `ui-monospace, SFMono-Regular, Consolas, monospace` for JSON/query/code.
- Recommended scale: 12/14/16px text, 20/24/30px headings; tabular numerals in measurements.
- 4px base spacing scale: 4, 8, 12, 16, 24, 32; compact/comfortable density option for event tables.
- 40px minimum standard controls with visible focus, scalable layout, resizable explorer panels.

## 5. Information architecture
- Left navigation: Overview, Log Explorer, Errors, Performance, Traces (when implemented), Jobs, Alerts, Saved Searches, Integrations, Tokens, Administration.
- Global context: project and environment selector, current time range, environment badge, service selector, permission-aware account menu.
- Search workspace: query editor → submit/status/time range → histogram → fields pane + results grid → expandable detail drawer.
- Save/share queries with ownership and project scope; indicators for stale results/errors/partial data.

## 6. Required Log Explorer interactions
1. Select authorized projects (single initially; cross-project only elevated scoped access), environments, services, time window.
2. Search field names with data type icon; add/remove/reorder visible columns and filter on values.
3. Visual filter builder and guarded advanced expression editor; syntax completion from supported allowlist; explicit `Run` action.
4. Histogram aggregated by event timestamp; click-to-zoom; clear indicator if no data or partial results.
5. Results with virtualized/safely paginated rows, sort, severity, date and summary; click drawer for structured JSON tree and sanitized raw event.
6. Show loading/cancellation, query execution duration, documents matched, timeout/permission warnings, copyable trace ID and safe export.

## 7. Reusable components decision matrix
| Need | Default approach |
|---|---|
| Buttons/forms/tables/dialogs/date-time/toasts | Skyra Platform published packages; verify actual API |
| Query editor | LogHub integration with established code editor component; extract only editor wrapper if cross-app reusable |
| Histogram/percentile graphs | LogHub chart wrappers around Apache ECharts |
| Trace waterfall | LogHub-specific visualization, not generic platform primitive |
| JSON viewer | Build reusable sanitized viewer only after shared use-case confirmed |
| Permission badges, latency cells | LogHub feature-level presentation initially |

## 8. Component states
Every interactive component must define hover/focus/disabled, skeleton/loading, empty, error/timeout, permission denied and stale-data states. Show untrusted log text as escaped text, restrict URLs, and prevent clipboard export of redacted values.

## 9. Responsive behavior
Primary use desktop 1280px+, fully usable tablet; smaller screens collapse sidebar and filter panels, preserve search/time controls and use horizontal table scroll without truncating critical error context.

## 10. UX acceptance tests
Keyboard-only query/search/filter; contrast check; accessible field labels; project switch resets potentially unsafe stale results; no cross-project data flashes; visual snapshots at light/dark and key screen sizes; verify Skyra package compatibility before new UI coding.


## Report-first interaction patterns
- The primary landing experience is **Reports** with saved project dashboards, clear freshness indicators, fast previews and chart/table layouts. Log Explorer is prominent but secondary.
- Report Builder supports **Visual Mode** (field picker, type-aware filters, measure, aggregation, group-by, sort, time range, chart/table choice) and **Query Mode** (restricted Skyra Query Language). Both display validation, estimated scope and resulting SQL-free canonical definition.
- Report page states include cached/fresh/loading/partial/expired/error and accessible empty states; never silently show stale data as current.
- Log Explorer follows reference screenshots functionally: project selector, available fields, selected columns, bounded query editor, time histogram, results table, expandable sanitized JSON. Do not pixel-copy another product.
- Reuse versioned Skyra Platform form/table/select/dialog/tokens packages. Add generic missing controls there only after shared-consumer API/test review.
- Design layout for one owner and up to ten internal LogHub users while remaining responsive; watched products' audience size is unrelated.
