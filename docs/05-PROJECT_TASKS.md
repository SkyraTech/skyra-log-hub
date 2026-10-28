# Project Tasks and Phased Delivery Plan

> **Product:** Skyra LogHub  |  **Status:** Proposed baseline — review before implementation  |  **Version:** 0.1-draft  |  **Date:** 2026-10-21
> **Repository:** `skyra-loghub` (renamed by project owner). Assumptions and undecided items are marked **TBD**. These documents are design specifications, not assertions that code already exists.

## Status rules
`NOT_STARTED`, `READY`, `IN_PROGRESS`, `BLOCKED`, `IN_REVIEW`, `DONE`. Only mark `DONE` with evidence (commit, tests, verified deliverables). At creation, **nothing is implemented or tested by this document**. Phases may have preparation work in parallel but production deployments await security gates.

## Phase 0 — Documentation and baseline (no application code)
| ID | Task | Dependencies | Evidence / acceptance |
|---|---|---|---|
| LH-000 | Inspect renamed repository and working-tree state | none | Actual tree, manifest and existing-code inventory; report |
| LH-001 | Commit/review 14-document baseline | LH-000 | Stakeholder approval; internally consistent docs |
| LH-002 | Confirm decisions: identity, volume, retention, branding, hosting, canonical contracts | LH-001 | ADRs; remove relevant TBDs |
| LH-003 | Audit Skyra Platform package public APIs/distribution | LH-000 | Integration matrix and upstream issues |

## Phase 1 — Contracts and package foundations
| ID | Task | Status | Dependencies | Evidence / acceptance |
|---|---|---|---|---|
| LH-101 (LOGHUB-PKG-001 & PKG-001B) | Define canonical logging JSON Schema, storage contract, and fixture corpus | DONE | LH-002 | `contracts/schemas/v1/log-event.schema.json` (Draft 2020-12), `storage-contract.md` (mandatory instance isolation), fixtures corpus |
| LH-101C (LOGHUB-PKG-001C) | Final Schema Consistency, UUIDv4/Timestamp Verification & Distribution Verification | DONE | LH-101, LH-102, LH-104 | Pinned ECS 8.11.0, strict RFC 4122 UUIDv4, real calendar leap year/bounds validation, schema synchronization tooling (`sync:schemas`), and isolated consumer package tests passing |
| LH-102 (LOGHUB-PKG-001B/C) | TS logger-core metadata/redaction & build distribution | DONE | LH-101 | `@skyra/logger-core` compiled to `dist/`, cached Ajv 2020 validator, circular-safe compound key redaction, tarball verified in clean Node and TS consumers, 13 contract test suites passing |
| LH-103 (LOGHUB-PKG-002) | Node.js logging SDK & daily JSONL transport | DONE | LH-101C, LH-102 | `@skyra/logger-node` package, UTC midnight rotation, size rollover, partial-line quarantine recovery, bounded queue, emergency bypass, 35 automated tests passing, benchmarked at >15k ops/sec |
| LH-103A (LOGHUB-PKG-002A) | Transport Reliability, Security & Acceptance Hardening | DONE | LH-103 | Single-writer queue priority eviction, atomic instance directory ownership (`.instance.owner` with `O_EXCL` and PID liveness), privacy-safe quarantine (SHA-256 hash without plaintext secrets), Unicode message bounding, `maxEventSizeBytes` enforcement, 46 tests passing, isolated consumer verified |
| LH-104 (LOGHUB-PKG-001B/C) | Python SDK parity & wheel distribution | DONE | LH-101 | `skyra-logger` Draft 2020-12 validator, calendar timestamp checking, wheel installed and verified in clean consumer, 14 test suites passing |
| LH-105 (LOGHUB-PKG-003) | NestJS Logging Adapter & Automatic API Observability | DONE | LH-103, LH-103A | `@skyra/logger-nestjs` package, `SkyraLoggerModule`, automatic HTTP request/response observability, W3C traceparent propagation via AsyncLocalStorage, route sanitization, `measureJob`/`measureDatabase` timers, 46 tests passing, packed tarball verified in isolated NestJS consumer |
| LH-105A (LOGHUB-PKG-004) | Next.js Server-Side Logging Adapter & Framework Observability | DONE | LH-105 | `@skyra/logger-next` package, `withSkyraLogging` App Router wrapper, `withSkyraAction` Server Action wrapper, `getSkyraServerLogger` for RSC, `registerSkyraInstrumentation`, 47 tests passing, packed tarball verified in isolated Next.js consumer. Tracked release risks: NEXT-RISK-01 (logging overhead), NEXT-RISK-02 (serverless transport), NEXT-RISK-03 (Edge runtime) |
| LH-105B (LOGHUB-PKG-005) | Production-Grade Python Logging SDK, Standard Logging Integration & Reliable JSONL Transport | DONE | LH-101C, LH-104 | `skyra-logger` package, `SkyraLoggingHandler` stdlib adapter, daily UTC rotation, size rollover, single-writer process ownership, crash recovery, bounded queue priority eviction, 75 automated tests passing, isolated wheel verified, performance benchmarked |
| LH-105C (LOGHUB-PKG-006) | Production-Grade Browser Logging SDK, Angular Integration & React Integration | DONE | LH-101C, LH-102 | `@skyra/logger-browser`, `@skyra/logger-angular`, `@skyra/logger-react`; zero Node.js runtime dependencies, canonical schema v1 compliance, memory/console/HTTP transports with sendBeacon fallback, bounded batch queue with priority eviction, unhandled exception/rejection capture, Angular standalone DI/ErrorHandler/Router/HTTP interceptor, React Provider/hook/ErrorBoundary, 50 automated tests passing, isolated consumer tarballs verified. Tracked release risks: PY-RISK-01..03, NEXT-RISK-01..03 |
| LH-105D (LOGHUB-PKG-007) | Cross-SDK Integration, Security, Performance, Compatibility & Release Hardening | DONE | LH-101C–105C | Complete SDK release hardening gate. All 8 SDK packages certified; shared cross-SDK fixture suite (14 canonical fixtures); real headless browser E2E passing 100% on Chrome 155 and Edge 155 via CDP; Python PY-RISK-01 reproduced and verified (>1.3k ops/s stdout, 911 ops/s file); React missing provider DEF-001 fixed with SafeNoopBrowserLogger; ownership collision DEF-002 fixed in Node & Python; schema_version DEF-003 aligned; 275 tests passing across TS & Python; GitHub Actions CI workflow created; packed distribution verified; SDK Foundation Gate: PASS |
| LH-106 | Package registry/release automation | NOT_STARTED | LH-103, LH-104 | Versioned packages independently install in clean consumers |


## Phase 2 — Ingestion and data persistence
| ID | Task | Status | Dependencies | Evidence / acceptance |
|---|---|---|---|---|
| LOGHUB-ING-001A | Centralized Ingestion Architecture Corrections & Contract Approval Gate | DONE | Architectural review | `contracts/ingestion/v1/`, `docs/ingestion/`, 20 offline tests passing, report `SKYRA_LOGHUB_ING_001A_CORRECTION_REPORT.md` |
| LOGHUB-ING-002 | Secure Gateway Foundation (NestJS/Fastify shell, Bearer auth, canonical validation, storage 503 gate) | DONE | LOGHUB-ING-001A | `apps/ingestion-gateway`, 47 unit/integration/security tests passing, 29.8k events/sec benchmark, report `SKYRA_LOGHUB_ING_002_IMPLEMENTATION_REPORT.md` |
| LOGHUB-ING-003 | Durable Journal & Archive Writer (WAL framing, fsync barrier, receipt foundation, segment writer, manifest generator) | DONE | LOGHUB-ING-002 | WAL engine, synchronous fsync barrier, CRC32C framing, receipt reconciliation, segment rotation, manifest checksums, crash recovery tests, 64 gateway tests passing, benchmarked at >29k events/sec |
| LOGHUB-ING-003A | PostgreSQL Integration, Durability Acceptance & Crash-Recovery Hardening | DONE (CONDITIONAL PASS) | LOGHUB-ING-003 | Hardened production DI & config validation, mid-file corruption detection, Scenario A WAL-authoritative deduplication, subprocess crash tests (exit 137/SIGKILL), 75 gateway tests passing, report `SKYRA_LOGHUB_ING_003A_VERIFICATION_REPORT.md` |
| LOGHUB-ING-003B | Live PostgreSQL Integration, Durability Acceptance & Production Readiness Verification | DONE (CONDITIONAL PASS) | LOGHUB-ING-003A | Preflight connectivity check, non-invasive live PostgreSQL test suite with graceful skip, 7-day retention boundary & expiration verification, test-count discrepancy resolved (388 unique tests), report `SKYRA_LOGHUB_ING_003B_ACCEPTANCE_REPORT.md` |
| LOGHUB-ING-003C | Live PostgreSQL Acceptance, Migration Verification & Final Durable Ingestion Gate | DONE (CONDITIONAL PASS) | LOGHUB-ING-003B | Complete 20-scenario live integration suite implemented in `live-postgresql.test.ts`; safe preflight connection gate; migration SQL reviewed (7 metadata tables, zero log body payloads, no destructive DDL); all 388 unique tests passing (310 TS + 78 Python); report `SKYRA_LOGHUB_ING_003C_ACCEPTANCE_REPORT.md` |
| LOGHUB-DB-001 | Existing PostgreSQL Server Connection & Isolated Database Provisioning | DONE | User authorization | Dedicated role `skyra_loghub_user` & database `skyra_loghub_dev` created on localhost:5432; read-only verification passed; existing Bachina Labs databases untouched; report `SKYRA_LOGHUB_DATABASE_SETUP_REPORT.md` |
| LOGHUB-DB-002 | Prisma Migration Deployment, Live PostgreSQL Integration & Final Durability Acceptance | DONE (PASS) | LOGHUB-DB-001, User authorization | Initial migration `20261024000000_init_metadata` deployed to `skyra_loghub_dev`; 7 metadata tables verified; all 21 live PostgreSQL test scenarios passed (100 in gateway); 408 total unique automated tests passing across monorepo; report `SKYRA_LOGHUB_DB_002_ACCEPTANCE_REPORT.md` |
| LOGHUB-ING-004 | Idempotency & Replay Hardening (concurrency locking, optional Valkey cache, 7-day retention pruner, multi-process ownership, compaction safeguards, 20-scenario failure tests) | DONE (PASS) | LOGHUB-DB-002 | Concurrency mutex (`DeduplicationLockService`), single-writer ownership (`JournalOwnershipManager`), non-authoritative read-through cache (`IReceiptCache`), 7-day retention pruner, WAL compaction safeguards, 120 gateway tests passing (428 total workspace tests passing), report `SKYRA_LOGHUB_ING_004_IMPLEMENTATION_REPORT.md` |
| LOGHUB-ING-005 | Local Shipper & Cross-SDK E2E (spool discovery, checkpoint manager, corrupt quarantine, cross-SDK integration) | DONE (PASS) | LOGHUB-ING-004 | Standalone shipper daemon (`apps/log-shipper`), Node/Python/Browser E2E delivery, NestJS/Angular/React adapters, 21 automated shipper tests passing, report `SKYRA_LOGHUB_ING_005_IMPLEMENTATION_REPORT.md` |
| LOGHUB-ING-006 | Phase 2 Final Integration, Data Integrity & Release Readiness Audit | DONE (PASS) | LOGHUB-ING-005 | Complete Phase 2 independent audit; 462 unique automated tests passing (384 TS + 78 Python); Real Edge CDP browser E2E passing; isolated consumer packages passing; 25-scenario failure matrix verified; single-active-writer topology certified; deliverable `docs/ingestion/11-PHASE2_ACCEPTANCE.md` and report `SKYRA_LOGHUB_ING_006_PHASE2_ACCEPTANCE_REPORT.md` |

## Phase 3 — Identity, Search & Analytical Query Foundation
| ID | Task | Status | Dependencies | Evidence / acceptance |
|---|---|---|---|---|
| LOGHUB-QUERY-001 | Phase 3 — Query Architecture, Search API Contracts & Analytical Storage Design | DONE (PASS) | LOGHUB-ING-006 | `contracts/query/v1/*`, `tests/contracts/query-contracts.test.ts`, `docs/query/01-10`, ADR-017–021, DuckDB feasibility spike, report `SKYRA_LOGHUB_QUERY_001_ARCHITECTURE_REPORT.md` |
| LOGHUB-ARCH-001 | Enterprise Architecture, Clean Code, Project Structure & Engineering Quality Standards | DONE (PASS) | LOGHUB-QUERY-001 | `docs/architecture/01-10`, `docs/README.md`, DuckDB parameterization & safe literal escaping verified, report `SKYRA_LOGHUB_ARCH_001_QUALITY_STANDARDS_REPORT.md` |
| LOGHUB-QUERY-002 | Query Service Foundation & Secure Archive Discovery | DONE (PASS) | LOGHUB-ARCH-001 | `apps/query-service` application, read-only Prisma catalog access, `ArchiveDiscoveryService`, `DiscoveryValidationPipe`, `CorrelationIdMiddleware`, `AuditLoggingInterceptor`, path traversal & symlink defense, JWT/test verification, 56 automated tests passing (29 unit, 16 integration, 11 security/architecture), report `SKYRA_LOGHUB_QUERY_002_IMPLEMENTATION_REPORT.md` |
| LOGHUB-QUERY-003 | Secure DuckDB JSONL Query Execution, Structured Filtering & Resource Governance | DONE (PASS) | LOGHUB-QUERY-002 | `@duckdb/node-api` integration, in-memory hardened execution, `ILogQueryExecutionPort`, parameterized SQL generator, `FilterCompilerService`, `QueryResourceGovernorService`, true interrupt cancellation (`conn.interrupt()`), 90 query-service tests passing (34 new), 0 regressions, report `SKYRA_LOGHUB_QUERY_003_IMPLEMENTATION_REPORT.md` |
| LOGHUB-QUERY-004 | Search API, Keyset Cursor Pagination & Validation | DONE (PASS) | LOGHUB-QUERY-003 | `POST /query/v1/logs/search`, `GET /query/v1/logs/{eventId}`, pre-read tenant isolation gate (P0-A), 4-part composite locator tuple (P0-B), HMAC-SHA256 authenticated cursor codec, strict DTO schema validation, 116 query-service tests passing (26 new) across 19 suites, report `SKYRA_LOGHUB_QUERY_004_IMPLEMENTATION_REPORT.md` |
| LOGHUB-QUERY-005 | Aggregations, Facets & Bounded Analytical Execution | DONE (PASS) | LOGHUB-QUERY-004 | `POST /query/v1/logs/aggregate` (date_histogram, terms, cardinality), `POST /query/v1/logs/facets`, UTC bucket alignment, P0-A physical locator inner ordering, P0-B pre-read descriptor gate, 162 query-service tests passing (46 new) across 24 suites, report `SKYRA_LOGHUB_QUERY_005_IMPLEMENTATION_REPORT.md` |
| LOGHUB-QUERY-006 | Derived Parquet Conversion, Manifests, Catalog & Query Parity | DONE (PASS) | LOGHUB-QUERY-005 | Parquet cache module, DuckDbParquetConverter with ZSTD, atomic .staging publishing, FileParquetCatalogService with source checksum drift detection, HybridSourcePlannerService, complete semantic parity across JSONL/Parquet/Hybrid for search, date histograms, terms, and facets, 194 query-service tests passing (32 new) across 32 suites, report `SKYRA_LOGHUB_QUERY_006_IMPLEMENTATION_REPORT.md` |
| LOGHUB-QUERY-007 | Enterprise Security, Query Performance Optimization, Reliability & Operational Hardening | DONE (PASS) | LOGHUB-QUERY-006 | Parquet typed column projection & pushdown (up to 9.57x speedup), evidence-based hybrid source modes, stable duplicate event pagination, bounded fair tenant concurrency governor, atomic publication & staging recovery, 201 tests passing across 34 suites (366 monorepo active tests passing), report `SKYRA_LOGHUB_QUERY_007_HARDENING_REPORT.md` |
| LOGHUB-QUERY-008 | Phase 3 Final Functional Acceptance | DONE (PASS) | LOGHUB-QUERY-007 | Full 30-scenario test matrix verification (`ACC-001`–`ACC-030`), complete E2E pipeline acceptance test passing, 630 monorepo tests passing (210 in query-service), 0 regressions, deliverables `docs/query/11-PHASE3_ACCEPTANCE_MATRIX.md`, `docs/query/12-PHASE3_OPERATIONS_GAPS.md`, and report `SKYRA_LOGHUB_QUERY_008_PHASE3_ACCEPTANCE_REPORT.md` |
| LH-301 | OIDC login/MFA/session enforcement | NOT_STARTED | LH-201, LH-002 | Negative auth tests, logout/session revoke |
| LH-302 | Role/project memberships | NOT_STARTED | LH-301 | Explicit cross-project deny tests |
| LH-303 | Token issue/list/revoke/rotate/expiry | NOT_STARTED | LH-302 | Hashed verifier only, once-visible secret, immediate revoke tests |
| LH-304 | Query service AST, cost controls and field discovery | SUPERSEDED | LOGHUB-QUERY-001–007 | Superseded by LOGHUB-QUERY-001 through 007 |
| LH-305 | Distributed throttles and audit trails | NOT_STARTED | LH-303, LH-304 | Per identity/IP/token limits and auditable sensitive actions |

## Phase 4 — Web Console, Administration & Observability Experience
| ID | Task | Status | Dependencies | Evidence / acceptance |
|---|---|---|---|---|
| LOGHUB-CONSOLE-001 | Architecture, Design System & Contracts | DONE (PASS) | LOGHUB-QUERY-008 | Deliverables `docs/console/01-` to `11-`, ADR-022 to ADR-026, UI tokens, screen specs, API gap analysis, architecture report `SKYRA_LOGHUB_CONSOLE_001_ARCHITECTURE_REPORT.md` |
| LOGHUB-CONSOLE-002 | Angular Foundation, Shell & Design Tokens | DONE (PASS) | LOGHUB-CONSOLE-001 | Angular 19 standalone workspace `apps/console-web`, layout shell, CSS custom properties, Light/Dark theme, high-density table (32px/40px), UI showcase, 22 automated tests passing, production AOT build passing, report `SKYRA_LOGHUB_CONSOLE_002_IMPLEMENTATION_REPORT.md` |
| LOGHUB-CONSOLE-003 | Core API Client, Session & Context | DONE (PASS) | LOGHUB-CONSOLE-002 | BFF auth gateway `apps/console-bff`, OIDC PKCE flow, multi-tenant workspace context, short-lived JWT minting, 43 unit/integration tests passing, audit `SKYRA_LOGHUB_CONSOLE_003_FINAL_AUDIT.md` |
| LOGHUB-CONSOLE-004 | Log Explorer & Event Drawer | DONE (PASS) | LOGHUB-CONSOLE-003 | Live search integration, dynamic facets, signed keyset cursor pagination with bounded history, slide-out drawer, safe JSON inspector, 50 console-web tests & 50 BFF tests passing, report `SKYRA_LOGHUB_CONSOLE_004_IMPLEMENTATION_REPORT.md` |
| LOGHUB-CONSOLE-005 | Overview & Analytics Dashboards | DONE (PASS) | LOGHUB-CONSOLE-004 | Live Overview KPIs, interactive SVG date-histogram time-series chart, terms & severity distributions, error breakdown, dynamic dimensions, secure drilldowns to /logs, 67 console-web tests & 52 BFF tests passing, report `SKYRA_LOGHUB_CONSOLE_005_IMPLEMENTATION_REPORT.md` |
| LOGHUB-ADMIN-001 | Administration Backend Architecture & Contracts | DONE (PASS — Architecture Ready) | LOGHUB-CONSOLE-005 | Architecture specifications `docs/admin/01-` to `12-`, ADR-027 to ADR-033, OpenAPI 3.1 & JSON Schemas in `contracts/admin/v1/`, contract test suite passing 7/7 (52 monorepo contract tests), report `SKYRA_LOGHUB_ADMIN_001_ARCHITECTURE_REPORT.md` |
| LOGHUB-ADMIN-002 | Authoritative Identity, RBAC & Gate A Preparation | DONE (PASS — Gate A Ready) | LOGHUB-ADMIN-001 | Dedicated `apps/admin-service` foundation, Clean Architecture, identity tuple `(issuer, subject)`, 5-tier RBAC & 22 capabilities, migration artifacts in `docs/admin/migrations/ADMIN-002/`, AuthoritativeMembershipAdapter in BFF, 48 admin unit/security tests passing, 802 total monorepo tests passing, report `SKYRA_LOGHUB_ADMIN_002_GATE_A_IMPLEMENTATION_REPORT.md` |
| LOGHUB-ADMIN-002-GATE-B-VALIDATION | Isolated PostgreSQL Migration Execution & Concurrency Safety | DONE (PASS — Real PostgreSQL Certified) | LOGHUB-ADMIN-002 | Isolated PostgreSQL 18.0 execution on port 5433, 16 tables verified, 33/33 integration tests passing, last-owner concurrency row locking (`SELECT FOR UPDATE`) proven, atomic audit rollback proven, report `SKYRA_LOGHUB_ADMIN_002_GATE_B_VALIDATION_REPORT.md` |
| LOGHUB-ADMIN-002-GATE-B-STAGE-1A | Backup & Isolated Restore Rehearsal | DONE (PASS — Recovery Certified) | LOGHUB-ADMIN-002-GATE-B-VALIDATION | Logical backup captured via `pg_dump -Fc` (18,122 bytes, SHA-256 `1FA688...`), restored in 205 ms into isolated PG 18 (port 5433), 100% schema & data parity, zero source mutation, report `SKYRA_LOGHUB_ADMIN_002_GATE_B_STAGE_1A_IMPLEMENTATION_REPORT.md` |
| LOGHUB-ADMIN-002-GATE-B-STAGE-1B | Controlled Administration Schema Migration | PENDING_APPROVAL | LOGHUB-ADMIN-002-GATE-B-STAGE-1A | Explicitly approved execution of additive migration `docs/admin/migrations/ADMIN-002/migration.sql` on `skyra_loghub_dev` |
| LOGHUB-ADMIN-003 | Tenant, Project & Membership REST APIs | NOT_STARTED | LOGHUB-ADMIN-002-GATE-B | Admin Service implementation, `/admin/v1/tenants`, `/admin/v1/projects`, `/admin/v1/members`, transactional audit event logging |
| LOGHUB-ADMIN-004 | Credential, Quota & Retention APIs | NOT_STARTED | LOGHUB-ADMIN-003 | Ingestion credential creation (one-time secret), rotation with overlap, immediate revocation, runtime quota updates |
| LOGHUB-ADMIN-005 | Administration Security & Acceptance | NOT_STARTED | LOGHUB-ADMIN-004 | STRIDE negative security testing, concurrency conflict verification, complete 40-scenario acceptance gate |
| LOGHUB-CONSOLE-006 | Project & Credential Administration | NOT_STARTED | LOGHUB-CONSOLE-005, LOGHUB-ADMIN-004 | Angular administration workstation: Project management (`/projects`), ingestion credentials (`/ingestion`), team RBAC (`/team`) |
| LOGHUB-CONSOLE-007 | Performance, Security & E2E Hardening | NOT_STARTED | LOGHUB-CONSOLE-006 | Axe-Core WCAG 2.2 AA audit, keyboard navigation (`j`/`k`, `/`, `Esc`), Playwright E2E suites |
| LOGHUB-CONSOLE-008 | Phase 4 Final Acceptance & Certification| NOT_STARTED | LOGHUB-CONSOLE-007 | 30-dimension acceptance matrix verification, monorepo regression, production readiness audit |

## Phase 5 — Performance and diagnostics
| ID | Task | Dependencies | Evidence / acceptance |
|---|---|---|---|
| LH-501 | API timings/error groups/status metrics | LH-105, LH-405 | p50/p95/p99 with known synthetic load |
| LH-502 | DB client query timings/normalized fingerprints | LH-105 | No raw bind values; measured duration semantics |
| LH-503 | Jobs/dependencies/cache instrumentation | LH-501 | Cross-service trace ID and failure-path checks |
| LH-504 | Performance panels and alerts | LH-501–503 | Load tests, alert cooldown and dedupe |

## Phase 6 — MCP
| ID | Task | Dependencies | Evidence / acceptance |
|---|---|---|---|
| LH-601 | Authenticated MCP HTTP boundary | LH-303, LH-304 | OAuth discovery, scopes, token validation tests |
| LH-602 | Read-only tools: projects/search/errors/traces/performance/jobs | LH-601 | Every tool enforces project and query budgets |
| LH-603 | Claude Code/Antigravity integration pilots | LH-602 | Verified client-supported authentication setup |
| LH-604 | Prompt-injection and exfiltration security review | LH-603 | Untrusted log text cannot control tool behavior |

## Phase 7 — Production readiness and rollout
| ID | Task | Dependencies | Evidence / acceptance |
|---|---|---|---|
| LH-701 | Cloud/on-prem deployment profiles and secrets | LH-305 | No publicly reachable data stores |
| LH-702 | Load/resilience and backup/restore rehearsals | LH-504, LH-701 | Quantified limits and tested restore |
| LH-703 | Security audit and dependency scans | LH-604, LH-701 | No unresolved criticals |
| LH-704 | Pilot 1 NestJS + 1 Python, then migration guide | LH-703 | Production-style validation and signoff |

## Task submission format (Antigravity)
`Task ID`, requirements/source docs, branch, exact scope and allowed files, excluded work, tests, acceptance, outputs, status report. **Never batch an entire phase in one prompt.**

## Next task
`LH-000` inspect current renamed repository; docs baseline can be copied in after existing files are checked. Owner approval required for modifications and commits.


## Revised gating and priorities — applies before existing phase tasks
**LH-ARCH-001 (P0, NOT_STARTED):** Review and approve file-first central archive with JSONL→Parquet and DuckDB; capture benchmark acceptance, no application logs in PostgreSQL. No storage implementation before approval.
**LH-ARCH-002 (P0, NOT_STARTED):** Set synthetic benchmark profile using daily bytes, retention, query cardinality, report concurrency (1–10 LogHub users), and potentially high traffic in source projects.
**LH-DATA-001 (P0, NOT_STARTED):** Define centralized safe archive layout, atomic segments, ingestion checkpoint/ack semantics, retention/backups, manifest and recovery tests.
**LH-DATA-002 (P0, NOT_STARTED):** JSONL→Parquet converter/compactor; schema evolution, pruning, source integrity, idempotent retry and golden-fixture tests.
**LH-QUERY-001 (P0, NOT_STARTED):** DuckDB query worker with bounded parallelism, query AST compiler, authorization-scoped manifest resolution, cancellation/timeouts and SQL-injection tests.
**LH-REPORT-001 (P0, NOT_STARTED):** Canonical report definition + visual query builder + textual query editor; saved per-project reports, grouping/percentiles/charts, Jarvis-compatible API, performance tests.
**LH-REPORT-002 (P0, NOT_STARTED):** Cached/derived report results with freshness, invalidation on new archive segments and permission-safe cache keys; repeat-load benchmark.
**LH-SEARCH-001 (P1, NOT_STARTED):** Field discovery and log explorer using DuckDB; benchmark representative text searches before proposing a Tantivy index.
**LH-SEARCH-002 (P2, CONDITIONAL):** Tantivy proof-of-concept only if file/Parquet search benchmarks miss agreed targets.
**Migration note:** Existing storage-related LH-201–205 and LH-304 rows are interpreted using the revised file-first design and new LH-DATA/LH-QUERY tasks; resolve duplication during owner-approved task-plan cleanup. Reporting MVP must precede search polish while preserving security and SDK prerequisites.

---

### Executed Quality & Assurance Milestones
- **LOGHUB-ADMIN-002-GATE-B-STAGE-1A (2026-10-28):** PASS — Verified isolated PostgreSQL backup (`skyra_loghub_dev_pre_admin002_20261028051758.dump`), restore rehearsal into isolated port 5434, checksum verification.
- **LOGHUB-CONSOLE-VISUAL-001 (2026-10-28):** PASS — Comprehensive real-browser visual QA, responsive matrix (360px-1920px), dual-theme verification, and automated WCAG 2.2 AA accessibility audit (0 violations) across all 9 console screens. All 27 screenshots, diffs, and audit reports verified in `artifacts/visual-qa/LOGHUB-CONSOLE-VISUAL-001/`.
