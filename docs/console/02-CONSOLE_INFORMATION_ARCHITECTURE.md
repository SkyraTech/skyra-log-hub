# Skyra LogHub — Console Information Architecture & Route Design

**Document Version:** 1.0.0  
**Status:** Approved Architecture Specification  
**Task ID:** `LOGHUB-CONSOLE-001`  
**Phase:** Phase 4 — Web Console, Administration & Observability Experience  
**Date:** 2026-10-27  

---

## 1. Information Hierarchy & Navigation Framework

The Skyra LogHub Web Console organizes capabilities into a clear three-tier hierarchy: **Global Workspace Context**, **Primary Feature Navigation**, and **In-Page Analytical Views**.

```text
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Top Bar: [Tenant: Skyra Tech ▼]  [Projects: all (3) ▼]  [Env: Production ▼]  [Time: Last 1h ▼] │
├──────────────────────────┬─────────────────────────────────────────────────────────────────────┤
│ Primary Sidebar:         │ Main View Canvas:                                                   │
│                          │                                                                     │
│  [≡] Collapse Sidebar    │  Breadcrumbs: Home > Log Explorer > Search                          │
│                          │                                                                     │
│  📊 Overview             │  ┌───────────────────────────────────────────────────────────────┐  │
│  🔍 Log Explorer         │  │ Search Bar: "service:auth-service AND level:error"            │  │
│  📈 Analytics            │  └───────────────────────────────────────────────────────────────┘  │
│  ──────────────────────  │  [Time Histogram]                                                   │
│  📁 Projects             │  ┌──────────┬────────┬───────────────┬────────────────────────────┐ │
│  🔑 Ingestion & Keys     │  │ @timestamp│ Severity│ Service      │ Message                     │ │
│  👥 Team & Access        │  ├──────────┼────────┼───────────────┼────────────────────────────┤ │
│  ⚙️ Settings             │  │ 15:42:01 │ ERROR  │ auth-service  │ Token validation failed... │ │
│                          │  └──────────┴────────┴───────────────┴────────────────────────────┘ │
│  [Profile: Alex (Dev)]   │  Pagination: [← Prev Page]  [Page 2]  [Next Page →]                 │
│  [🌙 Dark / ☀️ Light]    │                                                                     │
└──────────────────────────┴─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Global Context Bar

The global context bar remains pinned across all routes, establishing the authoritative query boundary for all backend requests:

1. **Active Tenant Switcher:**
   - Single-tenant context bound to user's authenticated session.
   - For multi-tenant operators, switching tenants initiates a clean session reload, preventing cross-tenant cached data leakage.
2. **Authorized Project Scoper:**
   - Multi-select dropdown initialized to the user's permitted project list (derived from JWT token claims or session metadata).
   - Allows selecting "All Authorized Projects" or isolating a single project (e.g., `proj-analytics`).
   - Changing project scoping immediately triggers filter updates in active views.
3. **Environment Selector:**
   - Filter chips: `All`, `Production`, `Staging`, `Development`, `Test`.
   - Propagated into search and analytics queries as an allowlisted ECS structured filter: `environment eq <val>`.
4. **Global Time Range Control:**
   - Standard Presets: `Last 15 minutes`, `Last 1 hour`, `Last 4 hours`, `Last 24 hours`, `Last 7 days`, `Last 30 days`.
   - Custom Time Range: Dual calendar picker with precise UTC hour/minute/second selection.
   - Enforces the backend Query Service maximum interval ceiling of **30 days**.

---

## 3. Route Map & URL State Strategy

Every analytical investigation must be **shareable and reproducible via URL** without leaking credentials or raw event payloads.

### 3.1 Route Table

| Route Path | Feature Module | Guards | Primary Query Parameters | Description |
| :--- | :--- | :--- | :--- | :--- |
| `/login` | `AuthModule` | `GuestGuard` | `returnUrl` | Authentication entry and OIDC redirect handling. |
| `/auth/callback` | `AuthModule` | None | `code`, `state` | OIDC Authorization Code exchange handler. |
| `/overview` | `OverviewModule` | `AuthGuard` | `timeRange`, `projects` | High-level observability KPIs and error rates. |
| `/logs` | `LogExplorerModule` | `AuthGuard` | `q`, `projects`, `levels`, `from`, `to`, `cursor` | Primary Log Explorer and live search table. |
| `/logs/:eventId` | `LogExplorerModule` | `AuthGuard` | `projectId`, `date` | Direct canonical event lookup by UUIDv4. |
| `/analytics` | `AnalyticsModule` | `AuthGuard` | `interval`, `metric`, `groupBy`, `projects` | Histograms, terms distributions, dynamic facets. |
| `/projects` | `ProjectsModule` | `AuthGuard` | `status` | Listing of authorized projects and quotas. |
| `/projects/:projectId` | `ProjectsModule` | `AuthGuard`, `ProjectAdminGuard` | None | Project configuration, quotas, and retention. |
| `/ingestion` | `IngestionModule` | `AuthGuard`, `OrgAdminGuard` | None | Ingestion API credentials, shipper tokens, setup. |
| `/team` | `TeamModule` | `AuthGuard`, `OrgAdminGuard` | None | Team member invitations and RBAC role assignments. |
| `/settings` | `SettingsModule` | `AuthGuard` | None | User profile, theme toggle, and active session. |

### 3.2 URL Parameter Encoding & Safety Rules
- **State in URL:** Search text, structured filter chips, time boundaries, and active cursor keys are serialized into standard URL query parameters (e.g. `/logs?q=error&levels=error,fatal&from=2026-10-27T00:00:00Z&to=2026-10-27T23:59:59Z`).
- **No Credentials in URLs:** Tokens, session identifiers, and user passwords are strictly forbidden in URL paths or query parameters.
- **Tamper Resistance:** Keyset cursors stored in URLs are signed base64url HMAC-SHA256 tokens. Tampered cursor parameters trigger graceful fallback to page 1 rather than application crashes.
- **Length Bounding:** Search text in query strings is validated and capped at 512 characters; structured filters are capped at 10 items.

---

## 4. Role-Based Navigation & Access Rules

The frontend navigation dynamically adapts based on the user's verified role claims:

```text
┌─────────────────────────┬──────────────────────┬──────────────────────┬──────────────────────┐
│ Navigation Item         │ Developer / Viewer   │ Project Admin        │ Org Admin / Owner    │
├─────────────────────────┼──────────────────────┼──────────────────────┼──────────────────────┤
│ Overview Dashboard      │ Read-Only            │ Read-Only            │ Full Access          │
│ Log Explorer            │ Search & Inspect     │ Search & Inspect     │ Search & Inspect     │
│ Analytics Charts        │ View & Filter        │ View & Filter        │ View & Filter        │
│ Projects Management     │ View Permitted       │ Manage Assigned Proj │ Full CRUD            │
│ Ingestion Credentials   │ Hidden (403)         │ View Scoped Keys     │ Generate & Revoke    │
│ Team & Access           │ Hidden (403)         │ Hidden (403)         │ Full Member Admin    │
│ Workspace Settings      │ Personal Settings    │ Personal Settings    │ Global Org Settings  │
└─────────────────────────┴──────────────────────┴──────────────────────┴──────────────────────┘
```

**Security Invariant:** Route guards (`AuthGuard`, `OrgAdminGuard`) provide UX containment only. All backend APIs independently verify bearer JWT claims and project scopes before fulfilling any request.
