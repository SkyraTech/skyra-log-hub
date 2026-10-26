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
| LOGHUB-QUERY-003 | DuckDB-Backed JSONL Querying & Structured Filters | READY | LOGHUB-QUERY-002 | `@duckdb/node-api` integration, filter AST compiler, parameterization, in-memory execution |
| LOGHUB-QUERY-004 | Search API, Keyset Cursor Pagination & Validation | NOT_STARTED | LOGHUB-QUERY-003 | `POST /query/v1/logs/search`, `GET /query/v1/logs/{eventId}`, HMAC-SHA256 cursor codec |
| LOGHUB-QUERY-005 | Aggregations, Facets & Bounded Analytical Execution | NOT_STARTED | LOGHUB-QUERY-004 | `POST /query/v1/logs/aggregate`, `POST /query/v1/logs/facets`, date histograms, terms buckets |
| LOGHUB-QUERY-006 | Derived Parquet Conversion, Manifests, Catalog & Query Parity | NOT_STARTED | LOGHUB-QUERY-005 | Background conversion worker, ZSTD Parquet generation, `parquet_segments` migration proposal, query parity tests |
| LOGHUB-QUERY-007 | Query Performance, Authorization, Corruption & Recovery Hardening | NOT_STARTED | LOGHUB-QUERY-006 | Fair-share queue scheduler, timeout interrupt, `query_audit_logs` migration proposal, fault injection |
| LOGHUB-QUERY-008 | Phase 3 Final Functional Acceptance | NOT_STARTED | LOGHUB-QUERY-007 | Full 30-scenario test matrix verification (`QTEST-01`–`30`), E2E ingestion-to-search certification |
| LH-301 | OIDC login/MFA/session enforcement | NOT_STARTED | LH-201, LH-002 | Negative auth tests, logout/session revoke |
| LH-302 | Role/project memberships | NOT_STARTED | LH-301 | Explicit cross-project deny tests |
| LH-303 | Token issue/list/revoke/rotate/expiry | NOT_STARTED | LH-302 | Hashed verifier only, once-visible secret, immediate revoke tests |
| LH-304 | Query service AST, cost controls and field discovery | SUPERSEDED | LOGHUB-QUERY-001–007 | Superseded by LOGHUB-QUERY-001 through 007 |
| LH-305 | Distributed throttles and audit trails | NOT_STARTED | LH-303, LH-304 | Per identity/IP/token limits and auditable sensitive actions |

## Phase 4 — Angular Log Explorer
| ID | Task | Dependencies | Evidence / acceptance |
|---|---|---|---|
| LH-401 | Angular shell using Skyra Platform releases | LH-003, LH-301 | Install/build/accessibility smoke tests |
| LH-402 | Project/time/service selectors, saved filter state | LH-401, LH-304 | No stale unauthorized cross-project data |
| LH-403 | Field list and safe visual query builder | LH-402 | Field metadata tests, keyboard use |
| LH-404 | Approved advanced query subset/editor | LH-403 | Reject nonallowlisted commands and runaway queries |
| LH-405 | Histogram, results grid and JSON detail drawer | LH-403 | Search E2E and safe HTML/text rendering |
| LH-406 | Saved searches, controlled export | LH-405, LH-305 | Role/isolation tests and download auditing |

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
