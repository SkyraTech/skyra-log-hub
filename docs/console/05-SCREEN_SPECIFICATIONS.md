# Skyra LogHub — Web Console Screen Specifications

**Document Version:** 1.0.0  
**Status:** Approved Architecture Specification  
**Task ID:** `LOGHUB-CONSOLE-001`  
**Phase:** Phase 4 — Web Console, Administration & Observability Experience  
**Date:** 2026-10-27  

---

## 1. Screen 1: Login & Session Entry

- **Route:** `/login`
- **Primary Persona:** All users (Developers, Operators, Admins).
- **Purpose:** Secure workspace entry supporting OIDC enterprise Single Sign-On (SSO) and local development credentials.

```text
┌────────────────────────────────────────────────────────┐
│                      Skyra LogHub                      │
│            Centralized Observability Platform          │
├────────────────────────────────────────────────────────┤
│  [ Sign in with Enterprise SSO (OIDC / Entra ID) ]    │
│  ────────────────────── or ──────────────────────────  │
│  Tenant Domain: [ skyra-internal                     ] │
│  Username / Email: [ alex@skyra-tech.com             ] │
│  Password:      [ ••••••••••••••••••••••             ] │
│  [ Sign In ]                                           │
└────────────────────────────────────────────────────────┘
```
- **Interactive Behavior:** Clicking SSO initiates Authorization Code Flow with PKCE redirect to the corporate identity provider. Submitting password authenticates via `/api/v1/auth/login`.
- **States:**
  - *Loading:* Primary button displays spinner and disables input.
  - *Error:* Rejection renders alert banner: "Invalid credentials or unauthorized tenant membership".
- **Backend API:** Proposed `POST /api/v1/auth/login` and `GET /api/v1/auth/session` (see Gap Analysis).

---

## 2. Screen 2: Observability Overview Dashboard

- **Route:** `/overview`
- **Primary Persona:** Engineering Leads, SREs, Developers.
- **Status:** **Implemented & Verified (LOGHUB-CONSOLE-005 — PASS)**
- **Purpose:** High-level operational pulse across all active services and environments backed by authoritative DuckDB aggregations.

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Observability Overview                              [Tenant: skyra] [Project: billing] │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ [Time: Last 1 Hour ▼]  [Env: All ▼]                        [ ⟳ Refresh ]               │
│ Updated: 06:28:45 | Query: 14.2ms | Scanned: 2.1 MB                                    │
├───────────────────┬───────────────────┬───────────────────┬────────────────────────────┤
│ Total Logs        │ Exceptions/Errors │ Warnings          │ Active Services            │
│ 1,429,810         │ 3,421 (0.24%)     │ 14,892            │ 12                         │
│ [Explore in logs] │ [Explore in logs] │ [Explore in logs] │ [Explore in logs]          │
├───────────────────┴───────────────────┴───────────────────┴────────────────────────────┤
│ Ingestion & Volume Trend (Interactive Date Histogram):                                 │
│ [ ▇▇▆▅▄▃▂ ▂▃▄▅▆▇█ ] (Click any bucket to inspect time window in Log Explorer)          │
│ [ Toggle: Chart View / Accessible Table View (WCAG 2.2 AA) ]                           │
├───────────────────────────────────────┬────────────────────────────────────────────────┤
│ Severity Distribution:                │ Top Reporting Services:                        │
│ • INFO:  1,411,497 (98.7%)            │ 1. auth-service (542,100 - 37.9%)              │
│ • WARN:     14,892 (1.0%)             │ 2. billing-gateway (412,800 - 28.9%)           │
│ • ERROR:     3,421 (0.24%)            │ 3. search-indexer (241,000 - 16.9%)            │
│ (Click any level to drill down)       │ (Click any service to drill down)              │
└───────────────────────────────────────┴────────────────────────────────────────────────┘
```
- **Backend API Mapping:**
  - Batch Aggregations via BFF: `POST /bff/query/aggregate` $\rightarrow$ `POST /query/v1/logs/aggregate`
    - `volume_over_time`: `date_histogram` on `@timestamp`
    - `severity_distribution`: `terms` on `log.level`
    - `top_services`: `terms` on `service.name`
    - `active_services_count`: `cardinality` on `service.name`
- **Drilldown Integration:** Clicking any metric card, severity category, service name, or time-series bucket navigates to `/logs` with preserved filter bounds.

---

## 3. Screen 3: Log Explorer

- **Route:** `/logs`
- **Primary Persona:** Software Engineers, Incident Responders, SREs.
- **Status:** **Implemented & Verified (LOGHUB-CONSOLE-004 — PASS)**
- **Purpose:** Fast, interactive search and structured query exploration across millions of archived records backed by real DuckDB/JSONL/Parquet storage.

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Search: [ 🔍 auth-service failed                                      ] [ ⟳ Search ] │
│ Time Range: [ Last 1 Hour ▼ ]  Limit: [ 50 ▼ ]                  [ ✕ Cancel Active ]   │
│ [ ▇▇▇▇ Indeterminate Query Progress Bar (Active During In-Flight Queries) ▇▇▇▇▇▇▇▇ ]   │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Active Filters: [ service:auth-service ✕ ] [ level:error ✕ ]          [ Clear all ]   │
│ Severities: [ FATAL (0) ] [ ERROR (12) ] [ WARN (3) ] [ INFO (145) ] [ DEBUG (8) ]     │
│ Services:   [ auth-service (157) ] [ billing-gateway (11) ]                            │
│ Environments: [ production (168) ]                                                     │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Showing 50 events | Scanned: 42.1 MB | Segments: 14 | Execution: 28ms                  │
│ [ ← Previous Page ]   [ Page 1 (Keyset Cursor) ]   [ Next Page → ]                     │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Columns: [Timestamp ▼] [Severity] [Service] [Environment] [Message]                    │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 2026-10-27T15:42:01.234Z [ERROR] auth-service  prod  JWT signature verification failed │
│ 2026-10-27T15:42:00.891Z [ERROR] auth-service  prod  User lockout threshold exceeded   │
│ 2026-10-27T15:41:59.120Z [FATAL] auth-service  prod  Metadata connection pool exhausted│
└────────────────────────────────────────────────────────────────────────────────────────┘
```
- **Interactive Behavior & Production Architecture:**
  - **Live Search Execution:** Requests route from Angular through authenticated BFF proxy (`POST /api/v1/query/logs/search`) to Query Service (`POST /query/v1/logs/search`). BFF verifies session and workspace membership, minting an internal scoped JWT.
  - **Dynamic Facets:** Populates live severity, service, and environment counts via `POST /api/v1/query/logs/facets`.
  - **HMAC-Signed Keyset Pagination:** Angular treats tokens as opaque. Forward navigation uses `pagination.next_cursor`. Backward navigation pops from an in-memory `historyStack: PageRecord[]`. Cursors are strictly reset on filter, search text, time range, page size, or workspace change.
  - **Stale-Response & Cancellation Protection:** Monotonic `queryGeneration` counter discards out-of-order stale responses. In-flight requests are aborted upon new query or workspace switch.
  - **URL Investigation State:** Deep-links synchronize `q`, `range`, `levels`, `services`, and `eventId`.
  - **Row Selection:** Clicking any row opens the accessible **Event Detail Drawer**.
- **Backend API Mapping:**
  - Search: `POST /api/v1/query/logs/search` $\rightarrow$ `POST /query/v1/logs/search`
  - Facets: `POST /api/v1/query/logs/facets` $\rightarrow$ `POST /query/v1/logs/facets`

---

## 4. Screen 4: Event Detail Drawer

- **Trigger:** Clicking any record in the Log Explorer or navigating with deep-link URL parameter `?eventId=...`.
- **Primary Persona:** Software Engineers debugging exceptions.
- **Status:** **Implemented & Verified (LOGHUB-CONSOLE-004 — PASS)**
- **Purpose:** Full forensic inspection of canonical ECS fields, nested metadata, and trace correlation.

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Event Detail: 7c9e6679-7425-40de-944b-e07fc1f90ae7                     [ ✕ Close (Esc)]│
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Tabs: [ Summary Attributes ]  [ ECS Properties ]  [ Raw Canonical JSON ]               │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Summary Grid:                                                                          │
│ • Timestamp:   2026-10-27T15:42:01.234Z     • Severity:  ERROR                         │
│ • Service:     auth-service                 • Env:       production                    │
│ • Event ID:    7c9e6679-7425-40de...        [ 📋 Copy Event ID ]                       │
│ • Trace ID:    4bf92f3577b34da6a3ce92...    [ 📋 Copy Trace ID ]                       │
│ • Message:     JWT signature verification failed for user-8941                         │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Raw JSON Inspector:                                                                    │
│ ▾ {                                                                                    │
│     "@timestamp": "2026-10-27T15:42:01.234Z",                                          │
│     "log.level": "error",                                                              │
│     "service": { "name": "auth-service", "environment": "production" },                │
│     "message": "JWT signature verification failed for user-8941"                       │
│   }                                                                                    │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Actions: [ 📋 Copy Full JSON ]                                          [ Close ]      │
└────────────────────────────────────────────────────────────────────────────────────────┘
```
- **Security & Accessibility Engineering:**
  - **Zero `[innerHTML]` Rendering:** All untrusted message text and attributes render via Angular text interpolation `{{ ... }}`.
  - **Safe JSON Inspector:** Recursive tree rendering uses text-only bounded nodes with expand/collapse and copy actions.
  - **Keyboard Accessibility:** Traps focus inside drawer when open; handles `Escape` key to close; returns focus to triggering table row upon dismissal; full ARIA `role="dialog"` and `aria-modal="true"`.
- **Backend API:** `GET /api/v1/query/logs/:eventId?projectId=...` $\rightarrow$ `GET /query/v1/logs/:eventId`.

---

## 5. Screen 5: Analytics Dashboard

- **Route:** `/analytics`
- **Primary Persona:** SREs, DevOps Engineers, Performance Leads.
- **Status:** **Implemented & Verified (LOGHUB-CONSOLE-005 — PASS)**
- **Purpose:** Deep analytical telemetry exploration, high-resolution date histograms, exception classification, and multi-dimensional distribution analysis.

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Observability Analytics Workspace                   [Tenant: skyra] [Project: billing] │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Time Range: [ Last 24 Hours ▼ ]  Bucket: [ 1 Hour ▼ ]  [Env: All ▼]      [ ⟳ Refresh ] │
│ Query Generation: #4 | Execution: 18.5ms | Scanned: 4.8 MB                             │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Telemetry Volume Over Time (Interactive Date Histogram - Click to Drill Down to Logs): │
│ [ ▇▇▆▅▄▃▂ ▂▃▄▅▆▇█▇▆▅▄▃▂ ▂▃▄▅▆▇█ ]                                                     │
│ [ Toggle: SVG Chart / Accessible Tabular View (WCAG 2.2 AA) ]                          │
├───────────────────────────────────────┬────────────────────────────────────────────────┤
│ Severity Breakdown:                   │ Top Services Distribution:                     │
│ [████████████████████████████░░░░░░]  │ 1. auth-service         452,100  (45.2%)       │
│ • INFO:    950,230 (95.0%)            │ 2. billing-gateway      312,400  (31.2%)       │
│ • WARN:     42,100 (4.2%)             │ 3. search-indexer       180,000  (18.0%)       │
│ • ERROR:     7,420 (0.7%)             │ (Click any service to filter in Log Explorer)  │
├───────────────────────────────────────┴────────────────────────────────────────────────┤
│ Top Exception Classifications (error.type):                                            │
│ 1. ConnectionTimeoutException: 3,420 occurrences (Click to explore in logs)            │
│ 2. JWTVerificationException:   2,180 occurrences (Click to explore in logs)            │
│ 3. DatabasePoolExhausted:      1,820 occurrences (Click to explore in logs)            │
└────────────────────────────────────────────────────────────────────────────────────────┘
```
- **Backend API Mapping:**
  - Single-Batch Aggregation via BFF: `POST /bff/query/aggregate` $\rightarrow$ `POST /query/v1/logs/aggregate`
    - `volume_over_time`: `date_histogram` on `@timestamp` with interval
    - `severity_distribution`: `terms` on `log.level`
    - `top_services`: `terms` on `service.name`
    - `top_errors`: `terms` on `error.type`
    - `event_actions`: `terms` on `event.action`
- **Interactive Drilldowns:** One-click drilldown into `/logs` preserving exact time bucket bounds, error severity levels, or selected service names without leaking credentials or signed cursors.

---

## 6. Screen 6: Project Administration

- **Route:** `/projects` and `/projects/:projectId`
- **Primary Persona:** Platform Administrators, Project Leads.
- **Purpose:** Managing project namespaces, ingestion admission quotas, and retention policies.
- **Backend Status:** Currently metadata exists in PostgreSQL (`projects`, `project_quotas`), but **no administrative CRUD API exists**. Requires new backend milestone `LOGHUB-ADMIN-001`.

---

## 7. Screen 7: Ingestion & API Credentials

- **Route:** `/ingestion`
- **Primary Persona:** DevOps Engineers, Platform Administrators.
- **Purpose:** Managing machine bearer credentials for log shippers, applications, and proxies.
- **Backend Status:** Database table `ingestion_credentials` exists, but **no REST API exists** to create, list, or revoke credentials. Requires new backend milestone `LOGHUB-ADMIN-001`.

---

## 8. Screen 8: Team & Access Management (RBAC)

- **Route:** `/team`
- **Primary Persona:** Organization Admins.
- **Purpose:** Inviting users, assigning project-level permissions, and inspecting access grants.
- **Backend Status:** Currently no `User` or `Membership` database tables exist. Authentication is token-based. Requires new backend milestone `LOGHUB-AUTH-001`.
