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
- **Purpose:** High-level operational pulse across all active services and environments.

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ [Time: Last 24 Hours ▼]  [Projects: All ▼]  [Env: Production ▼]     [ ⟳ Refresh (10s) ]│
├───────────────────┬───────────────────┬───────────────────┬────────────────────────────┤
│ Total Events      │ Total Errors      │ Warning Count     │ Finalized Archive Storage  │
│ 1,429,810         │ 3,421 (0.24%)     │ 14,892            │ 42.1 GB (Parquet)          │
├───────────────────┴───────────────────┴───────────────────┴────────────────────────────┤
│ Ingestion & Error Volume Trend (UTC Date Histogram):                                   │
│ [ Bar Chart: Blue = Info, Yellow = Warn, Red = Error ]                                 │
├───────────────────────────────────────┬────────────────────────────────────────────────┤
│ Top Error-Producing Services:         │ Recent Critical Errors (Last 15m):             │
│ 1. auth-service (1,842 errors)        │ • 15:42:01 auth-service: JWT verification fail  │
│ 2. billing-gateway (920 errors)       │ • 15:40:12 payment-worker: Stripe timeout      │
│ 3. search-indexer (421 errors)        │ • 15:38:55 ingestion: WAL fsync latency > 5ms  │
└───────────────────────────────────────┴────────────────────────────────────────────────┘
```
- **Backend API Mapping:**
  - Aggregation totals: `POST /query/v1/logs/aggregate` (`date_histogram` with interval `1h`).
  - Top error services: `POST /query/v1/logs/aggregate` (`terms` aggregation on `service.name` with filter `log.level = 'error'`).
  - Recent critical errors: `POST /query/v1/logs/search` (`limit: 5`, filter `log.level in ['error', 'fatal']`).

---

## 3. Screen 3: Log Explorer

- **Route:** `/logs`
- **Primary Persona:** Software Engineers, Incident Responders.
- **Purpose:** Fast, interactive search and structured query exploration across millions of archived records.

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Search: [ 🔍 service.name eq "auth-service" AND log.level in ["error", "fatal"]     ]│
│ [ + Add Filter ]  [ Sev: Error, Fatal ✕ ]  [ Env: Production ✕ ]   [ ⏱ Last 1 Hour ▼ ]│
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Histogram Overview: (1,842 events matching active filter)                              │
│ [ ▇▇▆▅▄▃▂ ▂▃▄▅▆▇█ ] (Click and drag to zoom time interval)                             │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Columns: [Time ▼] [Severity] [Service] [Message]                       [ ⚙ Display ]  │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 15:42:01.234 [ERROR] auth-service     JWT signature verification failed for client... │
│ 15:42:00.891 [ERROR] auth-service     User lockout threshold exceeded for ip 10.0.4.12│
│ 15:41:59.120 [FATAL] auth-service     PostgreSQL metadata connection pool exhausted    │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Showing 1 - 50 of 1,842 records       [ ← Previous Page ]   [ Next Page (Cursor) → ]   │
└────────────────────────────────────────────────────────────────────────────────────────┘
```
- **Interactive Behavior:**
  - Typing in search bar debounces for 300ms before executing.
  - Clicking on any row opens the **Event Detail Drawer**.
  - Clicking "Next Page" supplies `pagination.cursor` token; previous page pops the cursor stack.
  - Histogram allows click-and-drag to narrow the active time boundary.
- **Backend API:** `POST /query/v1/logs/search` (Search API) and `POST /query/v1/logs/aggregate` (Date Histogram).

---

## 4. Screen 4: Event Detail Drawer

- **Trigger:** Clicking any record in the Log Explorer or navigating to `/logs/:eventId`.
- **Primary Persona:** Software Engineers debugging exceptions.
- **Purpose:** Full forensic inspection of canonical ECS fields, nested metadata, and trace correlation.

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Event Detail: 7c9e6679-7425-40de-944b-e07fc1f90ae7                     [ ✕ Close (Esc)]│
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Tabs: [ Formatted Fields ]  [ Raw ECS JSON ]  [ Trace & Context ]                      │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Field Name                  │ Value                                                    │
├─────────────────────────────┼──────────────────────────────────────────────────────────┤
│ @timestamp                  │ 2026-10-27T15:42:01.234567Z                              │
│ log.level                   │ error                                                    │
│ service.name                │ auth-service                                             │
│ service.environment         │ production                                               │
│ service.version             │ 2.4.1                                                    │
│ message                     │ JWT signature verification failed for user-8941          │
│ error.type                  │ JsonWebTokenError                                        │
│ error.message               │ invalid signature                                        │
│ error.stack_trace           │ JsonWebTokenError: invalid signature at JWT.verify...    │
│ http.request.method         │ POST                                                     │
│ http.response.status_code   │ 401                                                      │
│ trace.id                    │ 4bf92f3577b34da6a3ce929d0e0e4736                         │
│ span.id                     │ 00f067aa0ba902b7                                         │
├─────────────────────────────┴──────────────────────────────────────────────────────────┤
│ Actions: [ 📋 Copy Event ID ]  [ 📋 Copy Raw JSON ]  [ 🔍 Search Matching Trace ID ]   │
└────────────────────────────────────────────────────────────────────────────────────────┘
```
- **Backend API:** `GET /query/v1/logs/:eventId?projectId=...&date=...`.

---

## 5. Screen 5: Analytics Dashboard

- **Route:** `/analytics`
- **Primary Persona:** SREs, DevOps Engineers, Performance Leads.
- **Purpose:** Metric breakdowns, latency percentiles, error classification, and multi-dimensional facet discovery.
- **Components:**
  1. **Date Histogram Widget:** Configurable interval (`1m`, `5m`, `15m`, `1h`, `1d`).
  2. **Terms Distribution Widget:** Bounded frequency chart (top 10 services, top 10 error actions).
  3. **Dynamic Facet Panel:** Real-time distinct counts for `service.name`, `log.level`, `event.action`, `environment`, and `error.type`.
- **Backend API:** `POST /query/v1/logs/aggregate` and `POST /query/v1/logs/facets`.

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
