# @skyra/console-web

> **Skyra LogHub** — Enterprise Observability & Log Intelligence Web Console

`@skyra/console-web` is the enterprise observability workstation frontend for the Skyra LogHub platform. Built on Angular 19 (Standalone Components, Signals, Modern Control Flow, OnPush change detection), it provides a high-density, developer-focused log exploration and telemetry investigation experience.

---

## 1. Quick Start & Prerequisites

### Prerequisites

- **Node.js**: `v20.0.0` or higher (verified on Node `v24.21.0`)
- **Package Manager**: `pnpm` `v9.0.0` or higher (workspace uses `pnpm@12.3.4`)
- **Query Service Backend**: Running on `http://localhost:3100` (port 3100)
- **Ingestion Gateway**: Running on `http://localhost:3000` (port 3000)

### Development Commands

Run from monorepo root or within `apps/console-web`:

```bash
# Start local development server (port 4200)
pnpm --filter @skyra/console-web dev

# Production AOT build
pnpm --filter @skyra/console-web build

# Strict TypeScript typecheck
pnpm --filter @skyra/console-web typecheck

# Execute unit and component test suite
pnpm --filter @skyra/console-web test
```

Access the web console in browser at: `http://localhost:4200`

---

## 2. Architecture & Design Principles

The application adheres strictly to Clean Architecture boundaries:

```text
Presentation (App Shell, Layout, Features, Shared UI)
    ↓
Feature Application State / Facades (Angular Signals & Computed Stores)
    ↓
Domain Contracts (Session, Workspace, ProblemDetails, LogTable Models)
    ↓
Infrastructure / API Adapters (QueryApiClient, Functional Interceptors)
```

- **Standalone Components Only**: No NgModules.
- **Signals & Computed**: UI reactivity driven by fine-grained Angular Signals (`signal`, `computed`).
- **OnPush Change Detection**: Every component is configured with `ChangeDetectionStrategy.OnPush`.
- **Dual Themes with WCAG 2.2 AA Contrast**: Dark (default) and Light themes defined strictly through CSS custom properties in `src/styles/themes.css`.
- **High-Density Workstation Layout**: Row density toggles for 32px compact and 40px comfortable log inspections.
- **RFC 7807 Error Normalization**: Consistent API error modeling with Correlation ID tracking.

---

## 3. Directory Structure

```text
apps/console-web/
├── public/                 # Static assets and icons
├── src/
│   ├── app/
│   │   ├── core/           # Singleton infrastructure, auth contracts, error parser, workspace context
│   │   │   ├── auth/       # BFF session contracts and RBAC capability evaluation
│   │   │   ├── config/     # Typed environment configuration
│   │   │   ├── errors/     # RFC 7807 Problem Details model and error parser
│   │   │   ├── http/       # Strongly typed API client implementing IQueryApiClient port
│   │   │   ├── theme/      # Signal-based theme management (light/dark/system)
│   │   │   └── workspace/  # Multi-tenant workspace scoping and 30-day retention boundaries
│   │   ├── layout/         # App Shell, Collapsible Sidebar, Topbar, Breadcrumbs
│   │   ├── shared/         # Reusable design system primitives
│   │   │   └── ui/         # Button, Badge, SeverityBadge, Card, EmptyState, LogTable, Skeleton
│   │   ├── features/       # Lazy-loaded feature views
│   │   │   ├── overview/   # KPI metrics slots and ingestion volume trend
│   │   │   ├── log-explorer/# High-density search workstation and event detail drawer
│   │   │   ├── analytics/  # Faceted aggregations and histogram grid layout
│   │   │   ├── projects/   # Workspace project boundaries and RBAC overview
│   │   │   ├── settings/   # Theme personalization, API endpoints, and security posture
│   │   │   ├── showcase/   # Development-only visual showcase with isolated fixtures
│   │   │   └── not-found/  # 404 error destination
│   │   ├── app.component.ts
│   │   ├── app.config.ts
│   │   └── app.routes.ts
│   ├── styles/             # Centralized design tokens and typography
│   │   ├── tokens.css      # Spacing, radii, shadows, z-index scale
│   │   ├── themes.css      # Dual Light/Dark themes and semantic severities
│   │   ├── typography.css  # Inter sans-serif and JetBrains Mono monospace scale
│   │   ├── utilities.css   # Screen-reader, focus-visible, and scrollbar helpers
│   │   └── global.css      # Baseline CSS reset and layout defaults
│   ├── index.html
│   └── main.ts
├── tests/                  # Unit and component test suites (node:test + tsx)
├── angular.json
├── package.json
└── tsconfig.json
```

---

## 4. UI Showcase & Development Fixtures

To enable design review without connecting to live customer log streams, a dedicated **UI Showcase** route is provided:

- Route: `/showcase`
- Access: Clearly identified with a prominent **DEV PREVIEW FIXTURE** disclaimer banner.
- Contains synthetic fixtures demonstrating:
  - All button variants (`primary`, `secondary`, `ghost`, `danger`) and sizes (`sm`, `md`, `lg`)
  - Status badges and ECS log severity pills (`fatal`, `error`, `warn`, `info`, `debug`)
  - High-density log table in both 32px compact and 40px comfortable configurations
  - Loading skeleton shimmers and accessible empty states

---

## 5. Security & Isolation Guarantees

1. **No Sensitive Tokens in Browser Storage**: `localStorage` is strictly restricted to user UI theme preference (`skyra-theme`). No access tokens, refresh tokens, or session secrets are stored on the client.
2. **Untrusted Log Content Escaping**: All log messages and attributes are rendered as text nodes through standard Angular interpolation. Unsafe `[innerHTML]` is strictly prohibited.
3. **BFF Session Model**: Integrates with `@skyra/console-bff` via `__Host-skyra-session` HTTP-only, SameSite=Lax cookies, CSRF tokens (`X-CSRF-Token`), and multi-tab synchronization using `BroadcastChannel`.
4. **Role-Aware Route Protection**: `authGuard`, `orgAdminGuard`, and `roleGuard` protect application routes, redirecting unauthenticated requests to `/login` with returnUrl and unauthorized requests to `/unauthorized`.

---

## 6. Log Explorer Architecture & Query Lifecycle (CONSOLE-004)

`@skyra/console-web` provides a production-grade Log Explorer located at `/logs`:

- **Layered Clean Architecture**:
  - `domain/`: Typed request/response models, time range presets, filter chips, and composite stable row identity (`timestamp_service_eventId_index`).
  - `application/`: `LogExplorerFacade` coordinating `FilterStateService` and `CursorHistoryService`.
  - `components/`: `SearchToolbarComponent`, `FilterPanelComponent`, `QueryStatusComponent`, `JsonInspectorComponent`, and `LogEventDrawerComponent`.
- **Signed Keyset Cursor Pagination**:
  - Treats server HMAC-signed keyset cursors as opaque.
  - Implements bounded in-memory cursor history stack in `CursorHistoryService` for reliable backward navigation without client-side cursor decoding.
  - Resets cursors on query text, filter, time range, page size, or project change.
- **Dynamic Facets**:
  - Discovers distinct values and cardinality hit counts for services, environments, and log levels via `POST /bff/query/facets`.
- **Stale-Response & Cancellation Invariant**:
  - Maintains monotonically increasing `queryGeneration` counter; out-of-order slow responses are silently dropped.
  - Cancels active queries via `takeUntil` and propagates `AbortController` cancellation to BFF and Query Service.
- **Secure Inspection**:
  - Single-event lookup via `GET /bff/query/events/:eventId` with project scoping.
  - Fly-out detail drawer with ARIA dialog semantics, Escape key listener, and focus management.
  - Safe text-only JSON inspector with 0% `[innerHTML]`, bounded depth, and copy-to-clipboard.

---

## 7. Observability Overview & Analytics Dashboards (CONSOLE-005)

`@skyra/console-web` provides live operational overview and analytical dashboards:

- **Observability Overview (`/overview`)**:
  - Live authoritative KPI cards: Total Log Count, Exception/Error Count with error rate %, Warning Count, and Active Unique Services.
  - Interactive Ingestion & Volume Trend: Native SVG date-histogram chart with accessible table toggle.
  - Severity Distribution: Stacked visual proportion bar + interactive list.
  - Top Reporting Services: Ranked frequency list with proportion bars.
  - One-Click Deep-Link Drilldowns to `/logs`: Preserving exact time buckets, error severity filters, and service scopes.
- **Analytics Workspace (`/analytics`)**:
  - Multi-dimensional terms breakdown: `error.type` classification, `service.name` distribution, and `event.action` metrics.
  - High-resolution date histogram with configurable bucket interval (`1m`, `5m`, `15m`, `1h`, `6h`, `1d`).
  - Native Accessible SVG Charting Engine: Zero third-party dependencies, 0% `[innerHTML]`, keyboard navigable, and full WCAG 2.2 AA tabular fallback.
  - Bounded Batch Aggregation: Overview requests 4 aggregations and Analytics requests 5 aggregations via `POST /bff/query/aggregate`, honoring the DuckDB engine's batch limits.
  - Monotonic Query Cancellation: Race-free state updates and immediate data clearing on tenant/project switches.

---

## 8. Known Milestones & Scope Roadmap

- **LOGHUB-CONSOLE-001**: Architecture & UI/UX Design (Reported PASS)
- **LOGHUB-CONSOLE-002**: Angular Foundation, Responsive App Shell & Design System (Reported PASS)
- **LOGHUB-CONSOLE-003**: Enterprise BFF Authentication, OIDC Integration, Secure Sessions, Workspace Context & Role-Aware Angular Routing (Reported PASS)
- **LOGHUB-CONSOLE-004**: Enterprise Live Log Explorer, Secure Search Integration, Dynamic Facets, Signed Cursor Pagination & Event Investigation (Reported PASS)
- **LOGHUB-CONSOLE-005**: Live Observability Dashboard, Enterprise Analytics, Interactive Time-Series Charts & Secure Log Explorer Drilldowns (**THIS MILESTONE — PASS**)
- **LOGHUB-CONSOLE-006**: Project, Workspace, Membership & Ingestion Credential Administration (NEXT)


