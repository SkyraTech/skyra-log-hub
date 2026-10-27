# Skyra LogHub — Web Console Product Vision & Strategy

**Document Version:** 1.0.0  
**Status:** Approved Architecture Specification  
**Task ID:** `LOGHUB-CONSOLE-001`  
**Phase:** Phase 4 — Web Console, Administration & Observability Experience  
**Date:** 2026-10-27  

---

## 1. Executive Vision

Skyra LogHub is an enterprise-grade centralized log management, search, and analytics platform designed to solve large-scale observability challenges. Having established durable, single-writer ingestion (Phase 2) and accelerated DuckDB/Parquet query execution (Phase 3), **Phase 4 introduces the Skyra LogHub Web Console (`apps/console-web`)**.

The Web Console is **not** a generic administrative CRUD dashboard; it is a **high-performance, developer-first observability workstation**. It enables engineers and operators to rapidly search, filter, correlate, and analyze millions of log events with sub-second feedback, intuitive data-dense visual controls, and robust security isolation.

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Skyra LogHub Web Console Architecture                     │
├─────────────────────────────────────────────────────────────────────────────┤
│  Developers & SREs                Engineering Leads      Platform Admins    │
│  [Log Explorer & Event Drawer]    [Analytics & Trends]   [Projects & Auth]  │
├─────────────────────────────────────────────────────────────────────────────┤
│                    Angular 19 Standalone + Signals SPA                      │
│     Typed API Adapters  •  State Facades  •  Dual Light/Dark Design System  │
├─────────────────────────────────────────────────────────────────────────────┤
│                 BFF / Secure Session Gateway (Port 3000)                    │
│    OIDC/PKCE Auth  •  HTTP-Only Cookies  •  CSRF Defense  •  Rate Limits   │
├──────────────────────────────────────┬──────────────────────────────────────┤
│      Query Service (Port 3100)       │     Ingestion Gateway (Port 3000)    │
│  DuckDB • Parquet • Search • Facets  │     WAL • Deduplication • Quotas     │
└──────────────────────────────────────┴──────────────────────────────────────┘
```

---

## 2. Core Target Personas & User Needs

### 2.1 Persona 1: Senior Software Engineer ("Alex")
- **Primary Mission:** Rapid root-cause analysis during active production incidents.
- **Workflow:** Receives an alert containing a trace ID or error code; opens Log Explorer; applies time boundary; filters by `log.level = 'error'` and `service.name`; examines full structured ECS payload in the JSON drawer; copies correlation IDs to trace upstream services.
- **Key Requirements:**
  - Fast, debounced search without UI freezes.
  - Precise time-range boundaries (inclusive start, exclusive end).
  - Sanitized, readable JSON inspector with single-click clipboard copying.
  - Gapless pagination using signed keyset cursors.

### 2.2 Persona 2: Site Reliability Engineer ("Jordan")
- **Primary Mission:** Capacity planning, service health tracking, and error anomaly detection.
- **Workflow:** Opens Analytics Dashboard; tracks log ingestion volume and error trends across environments; evaluates date histograms; isolates high-frequency error signatures using dynamic facets; monitors query freshness watermarks.
- **Key Requirements:**
  - Interactive, responsive date histograms with click-to-zoom.
  - Multi-dimensional facet breakdowns (`service.name`, `log.level`, `error.type`).
  - Transparent freshness indicators reflecting finalized archive status.
  - Sub-second analytical queries powered by Parquet acceleration.

### 2.3 Persona 3: Platform Administrator & Security Lead ("Morgan")
- **Primary Mission:** Multi-tenant workspace governance, compliance auditing, and secure ingestion credential lifecycle.
- **Workflow:** Navigates Projects & Workspaces; creates new project boundaries; configures ingestion API credentials with restricted project/environment scope; monitors rate limits and quotas; audits user query activities.
- **Key Requirements:**
  - Fail-closed role-based access control (RBAC).
  - Explicit credential management with one-time secret display.
  - Clear separation between tenant administrative controls and developer search views.
  - Comprehensive operational and security audit logging.

---

## 3. Guiding Product Tenets

1. **Information Density with Zero Visual Clutter:** Engineers need dense tables and rapid context, not oversized decorative white-space. Layouts must prioritize content-first typography, clear contrast, and compact data grids.
2. **Authoritative Backend Security:** The browser console never trusts user input or client-side storage for permissions. The frontend reflects server-evaluated grants and enforces RFC 7807 problem details.
3. **No Fabricated Metrics or Fake CRUD:** Every metric, table row, and chart bucket maps directly to a verified backend contract. Where administrative APIs do not yet exist, the roadmap explicitly defines backend prerequisites rather than shipping frontend-only mock state.
4. **Sanitized by Default:** All log messages and string attributes are treated as untrusted text. The console forbids raw `innerHTML` rendering, shielding users from stored XSS and malicious terminal escape injection.
5. **Deterministic Keyset Navigation:** The console respects DuckDB's 4-part composite locator tuple `(@timestamp, event.id, segment_id, record_offset)`. Navigation relies on signed HMAC cursors, preventing "page jump" drift or skipped records.

---

## 4. Competitive Differentiation & Positioning

Unlike legacy observability tooling, Skyra LogHub Web Console delivers:
- **No Elasticsearch / OpenSearch Overhead:** Built directly on immutable canonical JSONL and derived Parquet files queried via DuckDB, avoiding massive memory-hungry indexing clusters.
- **Sleek, Modern Design System:** A tailor-made, accessible dual-theme visual identity that looks and feels like a cutting-edge SaaS workstation (inspired by Linear, Sentry, and Datadog) while maintaining distinct Skyra Tech branding.
- **Standardized ECS Schema:** Out-of-the-box standardization on Elastic Common Schema (ECS 8.11.0) and Skyra v1.0.0, ensuring uniform field names across Node.js, Python, NestJS, Next.js, and browser runtimes.
- **True Resource Governance:** Real-time visibility into query execution durations, tenant concurrency allocations, and memory safety without silent system lockups.
