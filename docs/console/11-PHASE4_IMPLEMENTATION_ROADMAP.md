# Skyra LogHub — Phase 4 Implementation Roadmap: Web Console & Observability Experience

**Document Version:** 1.0.0  
**Status:** Approved Architecture Specification  
**Task ID:** `LOGHUB-CONSOLE-001`  
**Phase:** Phase 4 — Web Console, Administration & Observability Experience  
**Date:** 2026-10-27  

---

## 1. Phase 4 Task Sequencing & Milestone Flow

Phase 4 delivers the complete web-based observability workstation for Skyra LogHub. Tasks are structured sequentially to ensure foundational design systems and verified Query APIs are implemented first, while clearly cordoning administrative screens behind required backend API milestones:

```text
LOGHUB-CONSOLE-001 (Architecture, Design System & Contracts)  [CURRENT - PASS]
         │
         ▼
LOGHUB-CONSOLE-002 (Angular Foundation, Shell & Design Tokens)
         │
         ▼
LOGHUB-CONSOLE-003 (Core API Client, Session & Workspace Context)
         │
         ▼
LOGHUB-CONSOLE-004 (Log Explorer & Canonical Event Drawer)
         │
         ▼
LOGHUB-CONSOLE-005 (Observability Overview & Analytics Dashboards)
         │
         ▼
[Backend Prerequisite: LOGHUB-ADMIN-001 — REST APIs for Projects & Credentials]
         │
         ▼
LOGHUB-CONSOLE-006 (Project & Ingestion Credential Administration)
         │
         ▼
LOGHUB-CONSOLE-007 (Performance, Security, Accessibility & E2E Hardening)
         │
         ▼
LOGHUB-CONSOLE-008 (Phase 4 Final Functional & Operational Acceptance)
```

---

## 2. Detailed Milestone Definitions

### LOGHUB-CONSOLE-001: Architecture, Product Design & API Integration Planning
- **Status:** Complete (PASS).
- **Scope:** Architecture review, UX design system, CSS custom property tokens, screen wireframes, API gap analysis, security threat model, and 5 new ADRs (ADR-022 to ADR-026).
- **Deliverables:** `docs/console/01-` through `11-`, `SKYRA_LOGHUB_CONSOLE_001_ARCHITECTURE_REPORT.md`.

### LOGHUB-CONSOLE-002: Angular Foundation, Shell & Design Tokens
- **Target:** Initialize `apps/console-web` with Angular 19 standalone components.
- **Scope:**
  - Setup Angular 19 workspace package in `apps/console-web/`.
  - Implement token-driven CSS styling with active Light/Dark mode switcher.
  - Implement core layout shell (collapsible sidebar, global top bar, breadcrumbs).
  - Implement functional `AuthGuard` and local dev mock authentication provider.
- **Verification:** Unit tests for shell components, theme toggling, and route guards.

### LOGHUB-CONSOLE-003: Core API Client, Session & Workspace Context
- **Target:** Strongly typed API integration and global tenant/project context management.
- **Scope:**
  - Implement `QueryApiClient` backed by `HttpClient` adhering to `contracts/query/v1/`.
  - Implement functional interceptors for Bearer auth and RFC 7807 error handling.
  - Implement Workspace Context Service managing active tenant, authorized projects, and global time-range filters with URL query-string synchronization.
- **Verification:** Contract tests mocking Query Service endpoints and verifying DTO serialization.

### LOGHUB-CONSOLE-004: Log Explorer & Canonical Event Drawer
- **Target:** Primary incident investigation workstation.
- **Scope:**
  - Implement structured query input with debounced execution and validation.
  - Implement high-density log table with millisecond timestamps and ECS severity badges.
  - Implement bidirectional keyset cursor pagination (`pagination.next_cursor` stack).
  - Implement slide-out Event Detail Drawer with Formatted Fields, Raw JSON syntax viewer, and trace correlation actions.
- **Verification:** Component tests, cursor pagination state tests, and XSS sanitization checks.

### LOGHUB-CONSOLE-005: Observability Overview & Analytics Dashboards
- **Target:** Operational KPI metrics, date histograms, and dynamic facets.
- **Scope:**
  - Implement Overview Dashboard KPI cards (Total events, error counts, active services).
  - Implement interactive UTC date histogram chart with click-and-drag interval zooming.
  - Implement Dynamic Facets sidebar panel discovering values for `service.name`, `log.level`, etc.
- **Verification:** Chart bucket math assertions, facet selection filtering tests, and empty state checks.

### [Backend Milestone] LOGHUB-ADMIN-001: Administration REST APIs
- **Target:** Expose RESTful management endpoints in backend services.
- **Scope:** CRUD endpoints for `projects`, `project_quotas`, and `ingestion_credentials` using existing PostgreSQL schema.
- **Deliverables:** OpenAPI contracts in `contracts/admin/v1/`, NestJS controllers, and Prisma repository adapters.

### LOGHUB-CONSOLE-006: Project & Ingestion Credential Administration
- **Target:** Administrative management screens.
- **Prerequisite:** Completion of `LOGHUB-ADMIN-001`.
- **Scope:**
  - Project listing and quota editing view.
  - Ingestion credential generation with secure one-time secret display and revocation modal.
- **Verification:** RBAC route guard tests and credential generation workflow tests.

### LOGHUB-CONSOLE-007: Performance, Security, Accessibility & E2E Hardening
- **Target:** Production readiness and enterprise quality gates.
- **Scope:**
  - Virtualization and rendering performance optimization for 500+ table rows.
  - Full keyboard shortcuts (`j`/`k`, `Enter`, `Esc`, `/`).
  - Automated Axe-Core accessibility audit guaranteeing WCAG 2.2 AA compliance.
  - Comprehensive Playwright E2E test suite covering primary user journeys.
- **Verification:** Zero Axe-Core violations, sub-100ms UI interaction latency, clean E2E passes.

### LOGHUB-CONSOLE-008: Phase 4 Final Acceptance & Operational Release
- **Target:** Final independent Phase 4 acceptance certification.
- **Scope:** Full regression testing across monorepo, documentation reconciliation, and operational handover.
