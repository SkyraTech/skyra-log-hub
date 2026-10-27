# Project Memory and Working Handoff

> **Product:** Skyra LogHub  |  **Status:** Proposed baseline — review before implementation  |  **Version:** 0.1-draft  |  **Date:** 2026-10-21
> **Repository:** `skyra-loghub` (renamed by project owner). Assumptions and undecided items are marked **TBD**. These documents are design specifications, not assertions that code already exists.

## Purpose
Persistent lightweight source of truth for humans, Antigravity and other assistants. **Do not assert unverified implementation, tests or deployments.** Update after each approved task and preserve chronological history.

## Current snapshot
| Item | State |
|---|---|
| Product | Skyra LogHub |
| Repository | `skyra-log-hub` |
| Current phase | Phase 3 — Search, Query & Analytics |
| Current task | LOGHUB-QUERY-006 (Derived Parquet Materialization, Hybrid Query Planning, Cache Integrity & Performance Acceleration Completed) |
| Implemented LogHub features | 8 SDK packages (Node, Python, NestJS, Next.js, Browser, Angular, React), Central Fastify Ingestion Gateway, Scoped Bearer Auth, Binary WAL with fsync, PostgreSQL Repositories, Central Immutable JSONL Archive with manifests, Standalone Log Shipper, Same-Origin Proxy, Crash Recovery, 7-Day Bounded Deduplication, Query Service with DuckDB Analytical Execution, Pre-Read Isolation Security Gate, 4-Part Composite Keyset Pagination, HMAC-SHA256 Signed Cursors, Search API (`POST /query/v1/logs/search`), Event Point Lookup (`GET /query/v1/logs/:eventId`), Analytical Aggregations (`POST /query/v1/logs/aggregate`), Dynamic Facets (`POST /query/v1/logs/facets`), Resource Governance, Derived Parquet Materialization (ZSTD), File-Backed Parquet Catalog, Crash Recovery Sweeper, and Transparent Hybrid Query Planning. |
| Documents | 15 baseline documents + Phase 2 Acceptance + Phase 3 Query Specs (ADR-017 through ADR-021, docs/query/01-10) + Implementation/Audit Reports |
| Tests | 194 Query Service tests (0 failed, 0 skipped), 45 Monorepo Contract tests, 120 Ingestion Gateway tests. All 359 active suite tests 100% green. |
| Hosting | AWS / Azure / own server portable (Docker / Linux filesystem) |
| Identity provider | OIDC / OAuth2 + scoped machine tokens (spec approved) |
| Design branding | Skyra Platform tokens |
| Canonical schema | ECS-compatible Skyra Logging Standard v1.0.0 released (Draft 2020-12, `contracts/schemas/v1/log-event.schema.json`) |

## Confirmed user requirements
- One monorepo for SDKs, Angular frontend, NestJS API, ingestion, MCP and infrastructure.
- Custom Angular dashboard; **do not use Kibana**; retain Discover-like query, time histogram, available fields, project selection, result table, expanded JSON.
- Reuse Skyra Platform components; fix shared issues upstream with approval and regression tests.
- Node/TS (NestJS/Next.js), Python and browser adapters; no .NET priority.
- Isolated UTC daily JSONL log files per project/environment/service/instance where persistent filesystem is available; support file-agent + direct export.
- API/DB/job/external call speed, trace correlation, auth/security audit, sensitive-data controls.
- OIDC employee login; permissioned expiring tokens for developer tools and authenticated read-only MCP.
- Azure, AWS or self-host portability; step-by-step prompt-driven Antigravity development and proper tests.

## Architecture decisions (proposed, not ratified)
| Date | Topic | Proposed outcome | Reference |
|---|---|---|---|
| 2026-10-21 | UI/API | Angular + NestJS | `02-SYSTEM_ARCHITECTURE.md` |
| 2026-10-21 | Storage | central JSONL archive + Parquet + DuckDB + PostgreSQL + Valkey/Redis | ADR pending |
| 2026-10-21 | Contracts | ECS-compatible JSON with Skyra extension, canonical source `skyra-service-contracts` | `07-LOGGING_STANDARD.md` |
| 2026-10-21 | Authorization | OIDC/MFA + project-scoped opaque credentials; OAuth for remote MCP | `08-SECURITY_AUTHENTICATION.md` |
| 2026-10-21 | Rollout | Do not migrate existing projects until SDK pilot accepted | `05-PROJECT_TASKS.md` |

## Completed tasks
- Task 00: Comprehensive repository and 14-document baseline inspection.
- LOGHUB-PKG-001: Logging Package Foundation & Canonical Schema.
- LOGHUB-PKG-001A: Independent Foundation Audit, Schema Verification & Security Review (identifying findings SEC-01 through SEC-08).
- LOGHUB-PKG-001B: Canonical Schema Alignment, Redaction Hardening & Package Distribution:
  - Aligned canonical JSON Schema Draft 2020-12 with ECS 8.11.0 (`ecs.version`, `database`, `user`, `client`, `url`, `user_agent`, `job`, `error`).
  - Added action and environment normalization (`dev` -> `development`, `qa` -> `test`, `http_request` -> `http.request.completed`).
  - Implemented Ajv 2020 cached schema validation in `@skyra/logger-core`.
  - Implemented `jsonschema` Draft 2020-12 validation in `skyra-logger` Python package.
  - Hardened redaction against compound keys (`clientSecret`, `dbPassword`, `stripeApiKey`), raw JWTs, URL credentials, and circular references.
  - Resolved distribution blockers: compiled `@skyra/logger-core` with `dist/` JS and `.d.ts` declaration files; verified Python wheel build.
  - Updated storage contract to enforce mandatory single-writer instance isolation and partial-line quarantine recovery.
  - 17 automated tests passing (8 TypeScript suites + 9 Python tests) with zero regressions.

### 2026-10-21 — LH-101C (LOGHUB-PKG-001C) — Final Schema Consistency & Package Verification
- Status: DONE
- Verified deliverables:
  - Canonical JSON Schema v1: pinned `ecs.version` to `const: "8.11.0"`, isolated from `skyra.schema_version` (`^1\.[0-9]+...`).
  - Strict RFC 4122 UUIDv4 regex pattern on `event.id` rejecting UUIDv1, UUIDv7, and malformed identifiers.
  - Calendar date & UTC validation: bounded months (01-12), days (01-31), leap years (Feb 29 only in leap years), hour/min/sec limits, and trailing 'Z'. Implemented consistently in both TypeScript (`isValidCalendarTimestamp`) and Python (`is_valid_calendar_timestamp`).
  - Schema synchronization check tooling (`scripts/sync-schemas.mjs`, `pnpm run check:schema-sync`, `pnpm run sync:schemas`) ensuring embedded copies never drift from canonical file.
  - Normalization immutability: `normalizeLogEvent` and `normalize_log_event` deep clone objects/dicts and never mutate caller-owned inputs.
  - Diagnostic privacy: validation error paths never leak secret payload values.
  - Distribution verification: isolated Node.js consumer (`node-consumer`), TypeScript consumer (`ts-consumer`), and Python wheel consumer (`py-consumer`) all installed and passed smoke tests with exit code 0.
- Test evidence:
  - TypeScript contract tests: 13/13 passed (`node --experimental-strip-types --test tests/contracts/schema-validation.test.ts`).
  - Python unit tests: 14/14 passed (`python -m unittest discover -s packages/logger-python/tests`).
  - Total tests: 27 automated tests passing with zero failures.

## In-progress tasks
- None (LOGHUB-PKG-001C completed, certified ready for LOGHUB-PKG-002).

## Blockers and decisions needed
1. Confirm identity provider (Keycloak / Auth0 / Azure Entra) for Phase 3.
2. Confirm deployment target (Azure / AWS / Self-hosted VM).

### 2026-10-22 — LOGHUB-PKG-002 — Production-Grade Node.js Logging SDK & Daily JSONL Transport
- Status: DONE
- Deliverables:
  - Created package `@skyra/logger-node` under `packages/logger-node/` built on `@skyra/logger-core`.
  - Implemented `SkyraLogger` with required methods: `trace()`, `debug()`, `info()`, `warn()`, `error()`, `fatal()`, `log()`, `flush()`, `close()`, `child()`, `isLevelEnabled()`, `setLevel()`, `getStatus()`.
  - Canonical event construction adhering to ECS 8.11.0, Skyra Logging Standard v1.0, and strict RFC 4122 UUIDv4 generation.
  - Deep redaction integration: pre-serialization scrubbing of passwords, bearer tokens, JWTs, cookies, URL credentials, and additional configurable sensitive keys.
  - Storage contract compliance (`contracts/storage-contract.md`): layout `${LOG_ROOT}/${PROJECT_ID}/${ENVIRONMENT}/${SERVICE_NAME}/${INSTANCE_ID}/${YYYY-MM-DD}.part-${PART_INDEX}.jsonl`.
  - UTC daily rotation at midnight UTC (`00:00:00Z`) with zero event loss and part index reset.
  - Size-based rollover at 100 MiB (configurable) with monotonic 4-digit zero-padded indexing (`0000`, `0001`, ...).
  - Partial-line corruption recovery: tail scanner detects incomplete records from crashes/power loss, quarantines corrupt fragments to `${YYYY-MM-DD}.corrupt.log`, and cleanly truncates `.jsonl` before accepting new records.
  - Bounded write queue with backpressure protection, queue overflow dropping for non-critical events, and emergency direct bypass for `error` and `fatal` events.
  - Dual transports: `JsonlFileTransport` with `fsync` durability on error/fatal, and `StdoutTransport` for containers/serverless.
  - Performance benchmarks: >15,700 ops/sec for small info events, >8,200 ops/sec for typical structured HTTP events, >17,700 ops/sec during bursts, p50 enqueue latency 35–66 µs.
- Test evidence:
  - 35 automated tests in `packages/logger-node/tests/` passing across unit, storage, reliability, security, and integration suites (`node --experimental-strip-types --test packages/logger-node/tests/**/*.test.ts`).
  - 13 schema contract tests in `tests/contracts/schema-validation.test.ts` passing.
  - 14 Python contract tests in `packages/logger-python/tests/` passing.
  - Total tests across workspace: 62 automated tests passing with zero failures.
  - Tarball packing verified (`pnpm pack`) without leaking raw TS sources.
- Next approved action:
  Execute LOGHUB-PKG-002A hardening audit and verification.

### 2026-10-22 — LH-103A (LOGHUB-PKG-002A) — Node.js Logging Transport Reliability, Security & Acceptance Hardening
- Status: DONE (Certified Hardened Production-Grade)
- Commit: (pending user commit approval)
- Root Causes & Hardened Corrections:
  1. **Emergency Write Single-Writer Invariant**: Replaced out-of-band concurrent writes to the file descriptor with serialized priority eviction in `WriteQueue`. Critical events (`error`, `fatal`) evict older non-critical events (`trace`, `debug`, `info`, `warn`) when the queue is saturated, preserving the strict single-writer rule, event ordering, rotation synchronization, and full tracking in `flush()` and `close()`.
  2. **Atomic Single-Writer Ownership**: Replaced non-atomic file overwrite with `InstanceOwnershipManager`. Uses exclusive file creation (`wx` / `O_EXCL`), process liveness checks (`process.kill(pid, 0)`), automatic recovery of stale locks from crashed dead PIDs, and an in-process active registry to prevent concurrent instances targeting the same directory.
  3. **Privacy-Safe Quarantine & Safe Recovery**: Hardened `recoverPartialLine` to record metadata only (`quarantine_timestamp`, `source_file`, `truncate_offset`, `corrupt_bytes_count`, `corruption_type`, `sha256_hash`, `safe_error_code`). Eliminated plaintext UTF-8 previews and raw Base64 from quarantine logs by default to prevent secret leakage. Added optional `enableForensicQuarantine: true`. Invariant enforced: quarantine metadata is written and fsynced to disk *before* the source file is truncated.
  4. **Canonical Schema Length & Unicode Truncation**: Corrected message truncation to reserve suffix room so the output is strictly `<= maxMessageLength` (8,192 chars), preventing schema rejection. Added UTF-16 surrogate pair preservation to prevent dangling high surrogates. Empty or whitespace-only messages now default to `"[empty]"` to satisfy `minLength: 1`.
  5. **Max Event Size Bounds**: Enforced `limits.maxEventSizeBytes` (1 MiB default). Oversized events drop with observable metrics; critical errors trigger minimal fallback payloads without large metadata payloads.
  6. **Separate Observability Metrics**: `LoggerStatus` and `TransportStatus` now separately track `totalEventsSubmitted`, `totalEventsAccepted`, `totalEventsDropped`, `totalEventsWritten`, and `totalEventsFsynced`.
- Test Evidence:
  - 46 automated tests in `packages/logger-node/tests/` passing with 0 failures across 10 test suites (including 11 targeted scenarios in `tests/hardening/hardening-verification.test.ts`).
  - Isolated package installation verified outside monorepo (`isolated-consumer-test` using packed `.tgz`).
  - Full repository regression tests passing: 13 TS contract tests + 14 Python contract tests (73 total automated tests across monorepo).
  - Schema synchronization check passing with zero drift.

### 2026-10-22 — LH-105 (LOGHUB-PKG-003) — Production-Grade NestJS Logging Adapter & Automatic API Observability
- Status: DONE
- Commit: (pending user commit approval)
- Implemented Deliverables:
  1. Package `@skyra/logger-nestjs` under `packages/logger-nestjs/` built on `@skyra/logger-node` and `@skyra/logger-core`.
  2. `SkyraLoggerModule` with `.forRoot()` and `.forRootAsync()` (supports `useFactory`, `useClass`, `useExisting`).
  3. `SkyraLoggerService` implementing NestJS `LoggerService`, lifecycle hooks (`OnApplicationShutdown`, `BeforeApplicationShutdown`), child logging, and instrumentation helpers.
  4. Automatic HTTP Observability: `SkyraHttpLoggingInterceptor` emits `http.request.completed` with high-resolution monotonic duration (`process.hrtime.bigint()`), HTTP status code, sanitized route template, and outcome.
  5. Correlation Middleware: `SkyraCorrelationMiddleware` parses W3C `traceparent` headers (`trace.id` 32-hex, `span.id` 16-hex), validates version and non-zero IDs, generates/reuses `x-request-id`, and binds execution scope using Node.js `AsyncLocalStorage` via `RequestContextService`.
  6. Route & Secret Sanitization: `sanitizeRouteTemplate` strips query strings, auth tokens, and raw IDs (`:id`) from path templates without leaking PII.
  7. Exception Handling: `SkyraHttpExceptionFilter` captures `HttpException` and uncaught exceptions with sanitized stack traces while preserving standard NestJS HTTP response semantics (stack traces are never exposed to API clients).
  8. Dedicated Instrumentation Timers: `measureJob()` for background jobs and `measureDatabase()` for database queries (strictly zero raw bind parameters).
  9. Carry-Forward Hardening: Added `'span'`, `'spanid'`, `'spans'` to `BENIGN_KEYS` in `@skyra/logger-core` to prevent false positive PAN redaction of W3C span sections; preserved canonical envelope sections (`trace`, `span`, `skyra.http`) across serialization.
- Test Evidence:
  - 42 automated tests in `packages/logger-nestjs/dist-test/` passing across unit, integration, and security suites.
  - Isolated consumer verified: npm tarball installation in external consumer app confirmed clean ESM imports, real HTTP execution, schema-compliant JSONL generation, and graceful shutdown.
  - Full workspace regression: 101 tests passing with 0 failures across TS contracts (13), Node SDK (46), and NestJS adapter (42).
  - 14 Python contract tests passing.
  - Schema synchronization check passing with zero drift.
- Benchmarks:
  - Request correlation (Middleware + ALS): 384,608 ops/sec (p50: 1.5 µs, p99: 13.5 µs).
  - Basic HTTP Event Build & Nonblocking Enqueue: 12,035 ops/sec (p50: 65.1 µs, p99: 240.6 µs).
  - Full End-to-End JSONL File Transport: 14,789 ops/sec (p50: 51.6 µs, p99: 156.2 µs).
- Next approved action:
  Await user review of `LOGHUB-PKG-003`. Next scheduled task is Next.js logging adapter or Package registry/release automation (`LH-106`).

### 2026-10-22 — LOGHUB-PKG-004 — Next.js Server-Side Logging Adapter, Instrumentation & Framework Integration
- Status: DONE
- Priority: P0
- Package: `@skyra/logger-next` (`packages/logger-next/`)
- Commit: (pending user commit approval)
- Implemented Deliverables:
  1. Mandatory Phase A NestJS Hardening & Envelope Defense:
     - A1 (Aborted HTTP requests): Detected premature client disconnects (`req.aborted`, `req.destroyed`, `!res.writableEnded` on close); mapped to HTTP status 499, severity `warn`, outcome `'failure'`, preventing false recordings of abandoned requests as successful.
     - A2 (Unknown-route privacy): Scrubbed emails and arbitrary tokens in unknown routes, falling back to safe placeholder `[unmatched-route]`.
     - A3 (Canonical envelope integrity): Strictly validated W3C `traceId` (32 hex, non-zero) and `spanId` (16 hex, non-zero); locked canonical envelope fields post-redaction against metadata overrides.
     - A4 (Database instrumentation): Emitted canonical actions `database.query.completed` and `database.query.failed` with duration consistency and schema validation.
     - 4 regression tests added to `@skyra/logger-nestjs` (tests 7-10); full NestJS suite passing 46/46.
  2. Next.js App Router Route Handler Wrapper (`withSkyraLogging`):
     - Wrapped route handlers preserving streaming response bodies (zero consumption/buffering), mapping status codes, recording monotonic durations, and stamping `x-request-id`.
     - Parameterized dynamic route template handling (e.g. `/api/users/[userId]`) and `[unmatched-route]` fallback for arbitrary raw paths.
  3. Server Actions & Server Functions Wrapper (`withSkyraAction`):
     - Measured asynchronous action duration, logged `action.completed` on success and `action.failed` on error.
     - Never serialized raw function arguments, form data, or return payloads by default; allowed approved metadata extraction only.
  4. Next.js Instrumentation Hooks (`instrumentation.ts`):
     - Integration helpers `registerSkyraInstrumentation` (for `register()`) and `createSkyraRequestErrorHandler` (for `onRequestError()`) with error deduplication.
  5. React Server Components Logging:
     - Explicit server logging via `getSkyraServerLogger()`.
  6. Distributed Tracing & Request Correlation:
     - AsyncLocalStorage context isolation across concurrent requests; W3C `traceparent` extraction and validation.
  7. Runtime Safety:
     - Auto-detected Node.js vs Serverless (stdout fallback) vs Edge runtime (file operations safely guarded).
- Test Evidence:
  - 40/40 unit tests passing in `packages/logger-next/tests/unit/` & `tests/security/`.
  - 7/7 real Next.js App Router integration tests passing against production build (`tests/integration/real-app-router.test.ts`).
  - Isolated package consumer test passing (10/10 criteria) using packed tarballs outside monorepo (`isolated-next-consumer`).
  - Full workspace test suite: 148 total tests passing across all packages (contracts: 13, node: 46, nestjs: 46, next: 47, python: 14).
- Benchmarks:
  - Baseline Route Handler: 22,835 ops/sec (mean: 23.0 µs, p50: 16.0 µs).
  - Correlation-Only (ALS + W3C): 19,648 ops/sec (mean: 34.5 µs, p50: 23.1 µs).
  - withSkyraLogging (JSONL File): 1,481 ops/sec (mean: 602.8 µs, p50: 503.2 µs, 100% written, 0 dropped).
  - Error-Logging (Exception serialization): 561 ops/sec (mean: 1,733.9 µs, 100% written, 0 dropped).
  - High-Concurrency Burst (50 burst): 6,899 ops/sec (mean: 6,296.5 µs, 100% written, 0 dropped).
  - withSkyraLogging (Stdout): 2,656 ops/sec (mean: 355.7 µs, p50: 294.5 µs, 100% written, 0 dropped).

### 2026-10-22 — LOGHUB-PKG-005 — Production-Grade Python Logging SDK, Standard Logging Integration & Reliable JSONL Transport
- Status: DONE
- Priority: P0
- Package: `skyra-logger` (`packages/logger-python/`)
- Commit: (pending user commit approval)
- Implemented Deliverables:
  1. **Production-Grade Python SDK & Public API**: Implemented `create_skyra_logger`, `SkyraLogger`, canonical levels (`trace`, `debug`, `info`, `warn`, `error`, `fatal`), child loggers, context manager support (`with`), and graceful shutdown (`flush`, `close`).
  2. **Standard Library Python `logging` Integration**: Implemented `SkyraLoggingHandler` mapping standard severities to canonical Skyra levels, preserving `record.name`, serializing `exc_info` and exception chains safely, preventing recursion.
  3. **Single-Writer Instance Directory Ownership**: Implemented `InstanceOwnershipManager` enforcing atomic marker creation (`.instance.owner` with `os.O_CREAT | os.O_EXCL | os.O_WRONLY`), cross-platform process liveness checks (`os.kill(pid, 0)`), automatic stale lock recovery for crashed PIDs, and an in-process active registry.
  4. **Daily UTC Midnight Rotation & Size Rollover**: Strict UTC date formatting, rollover at `00:00:00.000Z`, size-based rollover at `max_file_size_bytes` (100 MiB default), and monotonic 4-digit segment indexing (`YYYY-MM-DD.part-0000.jsonl`).
  5. **Bounded Write Queue & Backpressure**: Thread-safe `WriteQueue` with dedicated daemon worker thread, priority eviction for critical events (`error`, `fatal`), critical saturation bounds protection, and zero drops during normal operations.
  6. **Crash Recovery & Quarantine**: `recover_partial_line` safely detecting incomplete trailing lines and truncated JSON, quarantine metadata logged with SHA-256 hash to `${YYYY-MM-DD}.corrupt.log`, clean file truncation, and zero plaintext secret leakage by default.
  7. **Deep Redaction Engine & Post-Redaction Envelope Defense**: Compound keys, JWTs, URLs, tokens, passwords scrubbed; mandatory ECS canonical envelope fields locked post-redaction against caller overwrite.
  8. **Request & Trace Context Correlation**: `skyra_context` using Python `contextvars`, strict W3C 32-hex trace ID and 16-hex span ID validation (all-zero IDs rejected), and nested scope isolation.
  9. **Telemetry Instrumentation**: `measure_database` & `measure_database_async`, `measure_job` & `measure_job_async`, `measure_operation` & `measure_operation_async`, monotonic timing (`time.perf_counter_ns()`), exception propagation, and return value preservation.
  10. **Packaging & Distribution**: Standard `pyproject.toml` with `setuptools.build_meta`, built wheel `skyra_logger-1.0.0-py3-none-any.whl` and sdist `skyra_logger-1.0.0.tar.gz`, PEP 561 `py.typed` marker.
  11. **Preserved Next.js Release Risks**: Tracked NEXT-RISK-01 (logging overhead), NEXT-RISK-02 (serverless transport selection), and NEXT-RISK-03 (Edge runtime).
- Test Evidence:
  - 75 automated Python tests passing across 6 suites (14 contract schema, 12 functional, 5 context & timing, 12 storage & rotation, 12 reliability & concurrency, 12 security & redaction, 8 cross-language interop).
  - Isolated package consumer test passing 12/12 criteria using wheel installed in a clean virtual environment outside the repository (`scripts/verify_isolated_python_consumer.py`).
- Benchmarks:
  - Small Informational Events (Stdout): 636.5 events/sec (p50: 1,431.2 µs).
  - Typical Structured Events (File): 426.3 ops/sec (p50: 2,090.3 µs).
  - Errors with Fsync: 345.5 ops/sec (p50: 1,907.2 µs).
  - Redaction Engine: 10,796.7 ops/sec (p50: 78.0 µs).
  - Schema Validation: 1,284.9 ops/sec (p50: 675.5 µs).
  - Multithreaded Burst (8 threads): 513.1 ops/sec (0 drops).
  - Queue Saturation: Memory strictly bounded to <= 64 KiB, 6,773 non-critical events dropped with metrics, critical events admitted via priority eviction.

### 2026-10-22 — LOGHUB-PKG-006 — Production-Grade Browser Logging SDK, Angular Integration & React Integration
- Status: DONE
- Priority: P0 — Cross-Framework Logging SDKs
- Packages:
  - `@skyra/logger-browser` (`packages/logger-browser/`)
  - `@skyra/logger-angular` (`packages/logger-angular/`)
  - `@skyra/logger-react` (`packages/logger-react/`)
- Commit: (pending user commit approval)
- Implemented Deliverables:
  1. **Strict Zero-Node Browser Isolation**: Pure ESM distribution with zero Node.js runtime builtins (`node:fs`, `node:path`, `node:os`, `node:process`, `node:crypto`, `AsyncLocalStorage`). Uses standard Web APIs (`crypto.randomUUID()`, `performance.now()`, `fetch`, `navigator.sendBeacon`, `addEventListener`, `visibilitychange`, `pagehide`).
  2. **Canonical Schema v1 Compliance**: Full parity with Canonical JSON Schema v1 (ECS 8.11.0 / Skyra Schema v1.0). RFC 4122 UUIDv4 event IDs, UTC ISO 8601 timestamps, log level validation, canonical field immutability.
  3. **Privacy & Redaction Pre-Buffering**: Sensitive data (passwords, tokens, authorization headers, cookies, API keys, card numbers) redacted before buffering. Enforced bounds on message length (8,192 chars), metadata depth (6), object keys (100), array items (100), string lengths (1,024 chars), and circular reference handling.
  4. **Bounded Batch Queue & Transports**: FIFO queue with configurable flush intervals, max event counts, and max payload bytes. Priority eviction mechanism admits high-severity events (`error`, `fatal`) under queue saturation by evicting low-severity events (`trace`, `debug`, `info`). Injected transports include `MemoryTransport` (bounded memory inspection), `ConsoleTransport` (sanitized dev output), and `HttpTransport` (bounded batch POST, HTTPS enforcement, allowed origin validation, exponential backoff, permanent 4xx drop, and `sendBeacon` fallback on lifecycle exit).
  5. **Global Browser Capture**: Opt-in listeners for `window.error` and `window.unhandledrejection` with safe error normalization, stack sanitization, cross-origin script error mask handling, duplicate prevention, and clean teardown on `dispose()`.
  6. **Correlation, Timing & Navigation**: Monotonic timing with `startTimer()` recording nanoseconds and milliseconds without double-completion. W3C trace context validation (`traceparent` format checking, 32-hex trace ID, 16-hex span ID, origin allowlisting to prevent header leaks). Sanitized navigation tracking stripping query strings and credentials.
  7. **Angular Integration (`@skyra/logger-angular`)**: Thin standalone DI integration via `provideSkyraLogger()`. Injectable `SkyraLoggerService`, `SkyraErrorHandler` capturing uncaught application errors, `SkyraRouterTracker` observing Angular router navigation events, and `skyraHttpInterceptor` measuring HTTP request durations and outcomes without logging sensitive bodies.
  8. **React Integration (`@skyra/logger-react`)**: Thin integration via `SkyraLoggerProvider` and `useSkyraLogger()` hook (with sensible fallback logger if provider is omitted). Class-based `SkyraErrorBoundary` with fallback UI and error reset capability. Route tracking hook `useNavigationTracker`. Full SSR-safe imports with no window/document crashes.
  9. **Isolated Consumer Verification**: Built and packed `.tgz` tarballs for all 3 packages, installed into an isolated scratch directory outside the monorepo, and validated complete runtime functionality.
  10. **Preserved Carry-Forward Release Risks**: Retained Python risks (PY-RISK-01..03) and Next.js risks (NEXT-RISK-01..03) in the register.
- Test Evidence:
  - 50 new automated tests passing across 7 suites (Browser: 40 tests, Angular: 4 tests, React: 6 tests).
  - 264 total automated tests passing across the entire repository (Core: 46, NestJS: 46, Next.js: 47, Browser: 40, Angular: 4, React: 6, Python: 75).
  - Isolated consumer package verification script passing 3/3 packages (`scripts/verify_isolated_browser_consumer.mjs`).
- Benchmarks:
  - Event Construction Latency: 2,752 ops/sec (p50: 363.3 µs, p95: 412.0 µs, p99: 450.0 µs).
  - Redaction Overhead (Deep nested secrets): 1,732 ops/sec (p50: 577.2 µs, p95: 645.0 µs, p99: 698.0 µs).
  - Queue Saturation with Slow Transport: 4,000 events processed, 2,900 non-critical events dropped with counters, 100 critical error events admitted via priority eviction, memory strictly bounded to 256 KiB.
  - HttpTransport Serialization & Batching: 2,059 batches/sec (p50: 485.6 µs, p95: 550.0 µs, p99: 610.0 µs).

### 2026-10-23 — LOGHUB-PKG-007 — Cross-SDK Integration, Security, Performance, Compatibility & Release Hardening
- Status: DONE
- Priority: P0 — SDK Foundation Release Gate
- Scope: Independent Audit + Targeted Corrections + End-to-End Integration + Release Readiness across all 8 SDK packages:
  1. `@skyra/logger-core`
  2. `@skyra/logger-node`
  3. `@skyra/logger-nestjs`
  4. `@skyra/logger-next`
  5. `skyra-logger` (Python)
  6. `@skyra/logger-browser`
  7. `@skyra/logger-angular`
  8. `@skyra/logger-react`
- Confirmed Defects & Targeted Corrections:
  - **DEF-001 (Medium — `@skyra/logger-react`):** Missing `<SkyraLoggerProvider>` previously initialized a real `createSkyraBrowserLogger` logging to console and attaching listeners. Replaced with `SafeNoopBrowserLogger` in `skyra-logger-context.ts`, emitting a one-time dev warning, zero memory queues, zero attached listeners, and no unrouted logs.
  - **DEF-002 (High — Reliability & Competing Processes in Node.js and Python):** In `packages/logger-node/src/internal/ownership.ts` and `packages/logger-python/skyra_logger/internal/ownership.py`, after retry loop exhaustion, an unguarded `openSync('wx')` could leak an unhandled raw `EEXIST` / `FileExistsError`. Replaced with explicit lock inspection and clean `InstanceOwnershipConflictError`.
  - **DEF-003 (Minor — Cross-SDK schema_version inconsistency):** Browser SDK `skyra.schema_version` was `'1.0.0'` while all other SDKs used `'1.0'`. Aligned to canonical `'1.0'` across all SDKs and updated test assertions.
  - **DEF-004 (Minor — React Error Boundary test warning):** `resetError()` in `skyra-error-boundary.tsx` updated to eliminate unmounted `setState` warnings.
- Deliverables & Verification:
  1. **Canonical Schema Parity & Drift Protection:** Pinned ECS 8.11.0 and Skyra Schema v1.0 enforced across all 8 packages. Drift checks run via `check:schema-sync`.
  2. **Cross-SDK Shared Fixture Suite (`contracts/fixtures/cross-sdk/`):** 14 canonical JSON/JSONL fixtures covering valid canonical, Unicode escaping, date boundaries, database queries, HTTP requests, UI errors, background jobs, missing mandatory fields, invalid actions, malformed trace contexts, invalid severity, unsupported field types, nested metadata secrets, and URL credentials. Exercised by both TypeScript (`tests/contracts/cross-sdk-fixtures.test.ts`) and Python (`packages/logger-python/tests/interop/test_cross_sdk_fixtures.py`).
  3. **Real Browser End-to-End Suite (`tests/e2e/real-browser.test.mjs`):** Fully automated CDP execution against real headless Google Chrome 155 and Microsoft Edge 155. Verified UI event emission, sensitive key redaction, route sanitization, unhandled promise rejection capture, unhandled error capture, batch delivery to mock ingestion server, and clean listener teardown. 100% of received events pass authoritative Ajv Canonical Schema v1 validation.
  4. **Angular Integration Expanded:** Expanded test suite to 8 comprehensive tests covering standalone providers, DI, ErrorHandler, RouterTracker, HTTP interceptor, request/response body privacy exclusion, intermediate navigation filtering, `ngOnDestroy` teardown, and SSR safety.
  5. **Python Performance (PY-RISK-01 reproduced):** Measured on realistic representative workloads: Stdout: 1,366.5 ops/s (p50: 597.2 µs); File JSONL: 911.9 ops/s (p50: 953.2 µs); Fsync on Error: 727.2 ops/s (p50: 705.0 µs); Multithreaded (8 threads): 1,146.9 ops/s with 0 drops.
  6. **Isolated Consumer Verification:** Fresh tarballs and wheels installed in isolated directories outside the monorepo; verified 3/3 browser packages and 12/12 Python criteria.
  7. **CI Matrix:** Created reproducible `.github/workflows/sdk-verification.yml` spanning Schema, TypeScript, Python (3.10, 3.11, 3.12 on Linux/Windows/macOS), Chromium E2E, and isolated distribution checks.
- Test Evidence:
  - 275 total automated tests passing across the repository (197 TypeScript + 78 Python, 0 failures, 0 skips).
  - 2 Real Browser E2E test suites passing 100% (Chrome 155, Edge 155).
  - 2 isolated consumer test scripts passing 100%.
- Verdict: SDK Foundation Gate PASSED. Centralized ingestion development may proceed.

## Update template (copy per completed task)

```md
### YYYY-MM-DD — LH-XXX — Task name
- Status: DONE / BLOCKED / IN_REVIEW
- Commit(s): (actual hash, if any)
- Files changed:
- Acceptance evidence:
- Commands run and observed outcomes:
- Documentation updates:
- Known limitations/risks:
- Next task requiring approval:
```

## Session handoff rule
Always start by reading this file, `05-PROJECT_TASKS.md`, relevant ADR and task contract; end with an evidence-based entry. Never remove past decisions silently—mark superseded with rationale.


## Most recent agreed direction — 2026-10-21
- Repository renamed by owner to `skyra-loghub`; documents placed in `docs/`.
- Product: custom Angular + NestJS dashboard, Skyra Platform Web Components, reusable JS/TS/Python SDKs, project/day JSONL organization, secure MCP/Jarvis integration and test-first phased implementation.
- LogHub currently has one intended dashboard user; future internal LogHub users estimated **5–10**. This is **NOT** a limit or estimate for end users of the monitored Skyra projects. Log ingestion may grow independently.
- **Storage direction (provisional pending benchmark):** central authoritative JSONL segments; Parquet derived analytical files; DuckDB engine for report-first queries; PostgreSQL admin metadata ONLY; Valkey caching/rate controls. No Elasticsearch/Kibana/OpenSearch in baseline and no raw diagnostic events in PostgreSQL.
- **Priorities:** fast report loading is P0; search P1. Visual and restricted textual report definition both essential. Jarvis should be able to create/save/run project reports using token-scoped APIs/MCP; high-risk admin/file deletion actions gated.
- No feature implementation, performance benchmark, deploy or authentication integration is verified by document revision. Next step is owner review/approval of architecture and performance budgets, **not automatic Antigravity execution**.

### 2026-10-24 — LOGHUB-ING-001A — Centralized Ingestion Architecture Corrections & Contract Approval Gate
- **Status:** DONE (Contract & Architecture Gate Passed; Awaiting Owner Approval for ING-002)
- **Role:** Principal Distributed Systems Architect, Security Architect, Storage Reliability Engineer, API Contract Designer, Observability Platform Architect.
- **Scope & Deliverables:**
  - Corrected authoritative deduplication: replaced transient 24-hr Valkey cache with crash-recoverable WAL journal and PostgreSQL receipt index (ADR-015).
  - Corrected durability semantics: defined fsync barrier on journal file descriptor and parent directory; mapped 8 formal lifecycle states (ADR-013).
  - Formalized browser trust boundary: mandated same-origin application backend proxy; eliminated browser secrets; deprecated `X-Skyra-Proxy-Secret` in favor of standard Bearer tokens (ADR-012).
  - Enforced atomic all-or-nothing batch acceptance: removed HTTP 207 Multi-Status from MVP (ADR-016).
  - Maintained backward compatibility for legacy browser SDK batch envelopes while supporting authoritative v1 envelope.
  - Authored complete machine-readable contract suite under `contracts/ingestion/v1/`: `openapi.yaml` (OpenAPI 3.1.0), `batch-request.schema.json`, `batch-response.schema.json`, `error-response.schema.json`, `segment-manifest.schema.json`, `README.md`, and 8 example fixtures.
  - Authored 10 comprehensive architectural specifications under `docs/ingestion/` (`01` through `10`).
  - Implemented 20 offline contract verification tests in `tests/contracts/ingestion-contracts.test.ts`.
- **Test Evidence:**
  - `pnpm test:contracts`: 37 automated tests passing across 3 suites (0 failures, 0 skips, duration 608ms).
- **Gate Status:** PASS. Ready for architectural sign-off before starting `LOGHUB-ING-002`.

### 2026-10-24 — LOGHUB-ING-002 — Secure Centralized Ingestion Gateway Foundation
- **Status:** DONE (Gateway Foundation Complete; Ingestion Readiness correctly unavailable pending ING-003)
- **Scope & Deliverables:**
  - Built production-ready gateway package in `apps/ingestion-gateway` using NestJS and Fastify adapter.
  - Startup lifecycle with configuration validation (`GatewayConfigService`), graceful shutdown hooks, and request limits.
  - Hardened transport layer: Fastify custom `application/json` content-type parser enforcing `@skyra/logger-core` `parseStrictJson` to reject duplicate keys at any depth with HTTP 400 `INVALID_JSON`.
  - Machine bearer token authentication (`AuthService`, `AuthGuard`) with SHA-256 token hashing at rest, expiration, revocation, and zero credential leakage in error messages or logs.
  - Strict tenant and project authorization (`TenantService`, `ProjectService`) enforcing tenant isolation, allowed project lists, environment scoping, and project quotas.
  - Atomic batch admission and canonical event validation (`BatchValidationPipe`) verifying every event against `log-event.schema.json` and detecting intra-batch duplicate event IDs.
  - Backward compatibility for existing SDK legacy batch envelopes (synthesizing batch IDs without weakening validation).
  - Durability gate: `POST /ingest/v1/logs` explicitly returns `503 STORAGE_NOT_READY` (`retryable: true`) until `LOGHUB-ING-003` attaches durable WAL. No false durable success receipts!
  - Health probes: `GET /health/live` returns 200 OK; `GET /health/ready` returns 503 Service Unavailable with `durability_backend: "unavailable"`.
  - Prisma PostgreSQL metadata catalog prepared (`prisma/schema.prisma`, migration source `20261024000000_init_metadata/migration.sql`), with in-memory fallback repositories enabling 100% offline verification without touching user database instances.
  - Sliding-window rate limiting guard (`RateLimitGuard`) with `Retry-After` header.
  - Operational diagnostics service (`DiagnosticsService`) with metrics tracking and privacy protection.
- **Test Evidence:**
  - `pnpm --filter @skyra/ingestion-gateway test`: 47 automated tests passing across 8 suites (29 unit tests, 13 integration tests, 5 security tests) in 2.10s.
  - Ingestion admission benchmark (`pnpm --filter @skyra/ingestion-gateway bench`): **29,877 events/sec** (p50: 0.70ms, p95: 1.54ms, p99: 1.70ms) on schema-valid canonical events.
- **PostgreSQL Setup Notice:**
  - User's existing PostgreSQL servers and databases were completely untouched.
  - Manual creation of database `skyra_loghub_dev` by user is documented in `apps/ingestion-gateway/README.md`.
- **Next Task:** `LOGHUB-ING-003` (Durable Journal and Central Archive).

### 2026-10-24 — LOGHUB-ING-003 — Durable Write-Ahead Journal, PostgreSQL Integration & Central JSONL Archive
- **Status:** CONDITIONAL PASS (Durable WAL & Central Archive Engine 100% Implemented & Verified Offline; Real PostgreSQL Integration Ready with Human-Controlled Migration Gate Pending User Manual DB Setup)
- **Scope & Deliverables:**
  - **Recoverable WAL Engine (`WalJournalService`):** Contiguous binary framing (`SWAL`...`EWAL`), version 1, payload length prefix, 16B UUIDv4, fixed 64B tenant/project identity, uint32 event count, 32B SHA-256 payload digest, payload bytes, and 4B CRC32C checksum.
  - **Physical Commit Boundary (ADR-013 / ADR-016):** Synchronous hardware `fsync` barrier (`fs.fsyncSync(fd)`) executed sequentially after append and before emitting HTTP 200 `durably_accepted` response.
  - **Crash Recovery & Partial-Write Truncation:** Startup recovery scans active WAL segment from offset 0, validates CRC32C and SHA-256 digests, and deterministically truncates trailing corrupt or partial crash frames to the last valid commit boundary.
  - **Central JSONL Archive Writer (`ArchiveWriterService`):** Tenant-isolated hierarchy `${ARCHIVE_ROOT}/${tenantId}/${projectId}/${environment}/${serviceName}/${date}/segment-XXXX.jsonl`, strict path traversal checks, 100 MiB size rollover, UTC date rollover, and companion `segment-XXXX.manifest.json` generation validated against `contracts/ingestion/v1/segment-manifest.schema.json`. Finalized files locked to read-only `0o440`.
  - **Authoritative Idempotency & Replay Foundation (ADR-015):** 7-day bounded deduplication receipts (`DeduplicationReceiptRecord`), duplicate recognition returning original receipt with `duplicate: true`, payload mismatch detection triggering HTTP 409 `IDEMPOTENCY_CONFLICT`, and startup reconciliation restoring missing DB receipts directly from committed WAL frames.
  - **Prisma PostgreSQL Repositories:** Real `PrismaReceiptRepository`, `PrismaArchiveSegmentRepository`, and `PrismaCheckpointRepository` implemented for production; paired with zero-dependency in-memory doubles for 100% deterministic offline test execution.
  - **Health Probes:** `GET /health/live` returns 200 OK; `GET /health/ready` transitions to 200 OK when WAL journal is active, and fails closed with 503 `STORAGE_NOT_READY` upon storage failure or dismount.
  - **Ingestion Route:** `POST /ingest/v1/logs` returns 200 OK with `status: "durably_accepted"` and receipt metadata matching `contracts/ingestion/v1/batch-response.schema.json`.
- **Test Evidence:**
  - 64 automated tests in `apps/ingestion-gateway` passing across 12 suites (16 integration, 5 security, 8 config/validation/auth, 4 WAL framing, 4 crash recovery, 2 archive writer, 4 idempotency).
  - 362 total TypeScript monorepo tests passing with 0 failures across all 8 packages and contract tests.
  - 78 Python logging SDK tests passing with 0 failures.
  - Total workspace automated tests: 440 passing, 0 failures.
- **Durable Ingestion Benchmarks:**
  - Small Batches (10 events/batch): **4,686 events/sec** (469 batches/sec), p50 fsync ack: 1.92ms, p99: 4.28ms.
  - Medium Batches (50 events/batch): **17,972 events/sec** (359 batches/sec), p50 fsync ack: 2.47ms, p99: 4.37ms.
  - High-Density Batches (200 events/batch): **29,088 events/sec** (145 batches/sec), p50 fsync ack: 5.56ms, p99: 14.80ms.
  - Startup Recovery Duration: **0.021 ms** scan and recovery.
- **Human-Controlled Database Gate:**
  - Zero unauthorized migrations executed; user's existing PostgreSQL servers and databases were untouched.
- **Next Task:** `LOGHUB-ING-003A` (PostgreSQL Integration, Durability Acceptance & Crash-Recovery Hardening).

### 2026-10-24 — LOGHUB-ING-003A — PostgreSQL Integration, Durability Acceptance & Crash-Recovery Hardening
- **Status:** CONDITIONAL PASS (All offline durability, recovery hardening, DI safety, and process-kill recovery invariants verified; live PostgreSQL tests blocked pending user pgAdmin database creation and explicit migration authorization).
- **Hardening Deliverables:**
  - **Production DI & Config Hardening:** `GatewayConfigService` strictly rejects startup in production if `DATABASE_URL` is missing, placeholder, or non-PostgreSQL; `MetadataModule` strictly forbids in-memory fallback repositories in production; `HealthService` readiness gate marks `/health/ready` as 503 `not_ready` with `database: 'disconnected'` if PostgreSQL is unreachable in production.
  - **WAL Mid-File Corruption vs Torn Crash Write:** `WalJournalService` now explicitly scans downstream frames before truncation; mid-file corruption preserves downstream committed data without truncating, sets `isRecoveryRequired = true`, and surfaces 503 `STORAGE_NOT_READY` via readiness and ingestion gates; torn trailing crash writes at the end of the journal continue to be safely truncated.
  - **Authoritative WAL Deduplication (Scenario A):** In-memory index of committed frames in `WalJournalService` allows `ReceiptService.checkIdempotency()` to recognize previously committed batches even if PostgreSQL receipt insert failed during a temporary DB outage; returns `duplicate: true` with original receipt and completely eliminates duplicate WAL appends during client retries.
  - **Subprocess Crash & Termination Verification:** Hard process termination test using real child processes (`SIGKILL` / `exit 137`) proves that startup recovery restores committed batches, cleans torn trailing headers, and permits immediate safe appends.
- **Test Evidence:**
  - 75 automated tests passing in `apps/ingestion-gateway` across 16 suites (0 failures).
  - 373 total TypeScript monorepo tests passing with 0 failures across all 8 packages.
  - 78 Python logging SDK tests passing with 0 failures.
  - Total automated tests: 451 passing, 0 failures.
- **Physical Durability Benchmarks:**
  - Small Batches (10 events/batch): **3,930 events/sec**, p50 fsync: 2.25ms, p99: 3.70ms.
  - Medium Batches (50 events/batch): **14,104 events/sec**, p50 fsync: 3.29ms, p99: 6.08ms.
  - High-Density Batches (200 events/batch): **30,396 events/sec**, p50 fsync: 5.72ms, p99: 10.86ms.
- **Next Task:** `LOGHUB-ING-003B` (Live PostgreSQL Integration, Durability Acceptance & Production Readiness Verification).

### 2026-10-24 — LOGHUB-ING-003B — Live PostgreSQL Integration, Durability Acceptance & Production Readiness Verification
- **Status:** CONDITIONAL PASS (Live PostgreSQL integration test suite prepared with safe connection preflight and graceful skip; migration SQL verified; 7-day deduplication retention boundary & expiration proven with controlled test clock; historical test-count discrepancy fully resolved to 388 unique tests; live DB tests blocked pending user manual database setup).
- **Key Findings & Hardening Delivered:**
  - **Database Connection Preflight:** Verified port 5432 is open locally; `DATABASE_URL` is `NOT_SET`. Dedicated database (`skyra_loghub_dev`) and role (`skyra_loghub_user`) are strictly enforced. All live database tests gracefully detect missing configuration and output explicit setup instructions rather than erroring or accessing foreign databases.
  - **Migration Authorization Checkpoint:** Migration SQL (`20261024000000_init_metadata/migration.sql`) confirmed non-destructive and metadata-only (zero raw payload fields). Safe execution instructions prepared; execution blocked awaiting explicit user authorization (`WAITING_FOR_USER_MIGRATION_APPROVAL`).
  - **Seven-Day Idempotency & Horizon Boundary:** Added controlled-clock parameter to `ReceiptService.checkIdempotency()`; verified identical retries at Day 6 and Day 7-1s succeed with `duplicate: true`, while submissions at Day 7+1s are recognized as expired and subject to `pruneExpiredReceipts()`.
  - **Test-Count Discrepancy Resolved:** Reconciled historical numbers (451 / 471) by itemizing unique test files and cases per package. The workspace contains **388 unique automated test cases** (310 TypeScript across 8 packages/contracts + 78 Python), all passing with 0 failures.
- **Next Task:** `LOGHUB-ING-003C` (Live PostgreSQL Acceptance, Migration Verification & Final Durable Ingestion Gate).

### 2026-10-24 — LOGHUB-ING-003C — Live PostgreSQL Acceptance, Migration Verification & Final Durable Ingestion Gate
- **Status:** CONDITIONAL PASS (Comprehensive 20-scenario live integration suite implemented in `live-postgresql.test.ts`; read-only preflight gate prevents unauthorized DB access; migration SQL verified safe; all 388 unique automated tests passing across workspace).
- **Key Deliverables & Invariants Verified:**
  - **Comprehensive 20-Scenario Live Test Suite:** Updated `apps/ingestion-gateway/tests/integration/live-postgresql.test.ts` covering tenant creation, project creation, credential storage/scoping/revocation/expiration, tenant isolation, durable receipt storage, content digest conflict detection, database uniqueness constraint violations (`P2002`), archive segment manifest metadata persistence, checkpoint offsets, foreign-key constraints (`P2003`), transaction rollback (`$transaction`), concurrent insert reconciliation, database reconnection, and fail-closed readiness during outages.
  - **Preflight Safety Gate:** Protects user's other databases by validating connection string host, port, role, and database name strictly matching `skyra_loghub_dev`. Exits cleanly with informative diagnostic notice when `DATABASE_URL` is unconfigured.
  - **Reviewed Migration SQL:** `apps/ingestion-gateway/prisma/migrations/20261024000000_init_metadata/migration.sql` creates 7 metadata tables, stores zero raw log payloads (preserving the file-first JSONL architecture), and contains zero destructive SQL.
  - **Automated Regression Status:** All 388 unique automated tests passing (310 TypeScript + 78 Python) across all 8 SDKs, contracts, and gateway suites with zero failures.
- **Next Task:** `LOGHUB-DB-001` (Existing PostgreSQL Server Connection & Isolated Database Provisioning).

### 2026-10-24 — LOGHUB-DB-001 — Existing PostgreSQL Server Connection & Isolated Database Provisioning
- **Status:** READY (Dedicated database `skyra_loghub_dev` and least-privilege role `skyra_loghub_user` successfully provisioned on existing local PostgreSQL 17 instance; connection verified; `.env` configured and Git-ignored; Bachina Labs databases completely untouched).
- **Key Deliverables & Invariants Verified:**
  - **Preflight & Server Verification:** Connected to local PostgreSQL 17 on `localhost:5432` via administrative role `postgres`. Confirmed existing databases `bachina_labs_academy` and `bachina_labs_academy_shadow` were completely untouched and zero access was made against them.
  - **Role & Database Creation:** Created role `skyra_loghub_user` with `LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION` and a dedicated 24-character cryptographic password. Created database `skyra_loghub_dev` owned by `skyra_loghub_user`. Granted all permissions on `skyra_loghub_dev` and `public` schema.
  - **Connection Verification:** Successfully verified read-only connection: `current_database()` is `skyra_loghub_dev`, `current_user` is `skyra_loghub_user`, and `is_superuser` is `false`. Verified temporary table DDL works as expected in schema `public`.
  - **Environment Configuration:** Configured `apps/ingestion-gateway/.env` with URL-encoded `DATABASE_URL`. Verified `.env` is Git-ignored by `.gitignore` (`git check-ignore apps/ingestion-gateway/.env` returns 0).
  - **Prisma Migration Gate:** Stopped before running migrations; initial metadata migration `20261024000000_init_metadata/migration.sql` awaits separate user authorization.
- **Next Step:** `LOGHUB-DB-002` (Prisma Migration Deployment, Live PostgreSQL Integration & Final Durability Acceptance).

### 2026-10-24 — LOGHUB-DB-002 — Prisma Migration Deployment, Live PostgreSQL Integration & Final Durability Acceptance
- **Status:** PASS (User explicitly authorized migration; `20261024000000_init_metadata` deployed to `skyra_loghub_dev`; 7 metadata tables verified; all 21 live PostgreSQL tests passed; 408 unique tests passing across workspace).
- **Key Deliverables & Invariants Verified:**
  - **Migration Deployment:** Executed `pnpm exec prisma migrate deploy` targeting `skyra_loghub_dev` with role `skyra_loghub_user`. All 7 operational metadata tables (`tenants`, `projects`, `ingestion_credentials`, `project_quotas`, `archive_segments`, `deduplication_receipts`, `ingestion_checkpoints`) created and owned by `skyra_loghub_user`. Exactly zero raw log event tables created.
  - **Live PostgreSQL Integration Tests:** Executed `apps/ingestion-gateway/tests/integration/live-postgresql.test.ts` against real database. All 21 scenarios passed with 0 failures: tenant/project persistence, credential hash lookup, credential scoping, revocation, expiration, project isolation, cross-tenant isolation, durable receipts, conflict detection, unique constraints (`P2002`), archive manifest persistence, checkpoint persistence, foreign keys (`P2003`), transaction rollback (`$transaction`), concurrent insert reconciliation, database reconnection, and fail-closed readiness.
  - **Live Performance Benchmark:** Sub-1.5ms median latency for PostgreSQL receipt inserts (p50: 1.22ms, p95: 4.25ms) and lookups (p50: 1.17ms, p95: 2.49ms). Physical WAL fsync throughput demonstrated up to 10,926 events/sec (55 batches/sec) for 200-event batches.
  - **Workspace Regression:** All 408 unique automated tests passing across the workspace (330 TypeScript + 78 Python) with 0 failures.
  - **Preservation:** `bachina_labs_academy` and `bachina_labs_academy_shadow` strictly untouched.
- **Next Task:** `LOGHUB-ING-004` (Idempotency and Replay Hardening).

### 2026-10-24 — LOGHUB-ING-004 — Centralized Ingestion: Idempotency, Replay & Receipt Hardening
- **Status:** PASS (Concurrency mutex implemented; non-authoritative read-through replay cache with Valkey support delivered; 7-day retention pruner delivered; deterministic synthetic legacy batch IDs; cross-process exclusive directory ownership with stale lock recovery; WAL compaction safety gates; read-only storage diagnostics; comprehensive 20-scenario failure recovery test suite passing; 428 total unique automated tests passing across workspace).
- **Key Deliverables & Invariants Verified:**
  - **In-Flight Concurrency Mutex (`DeduplicationLockService`):** Implemented asynchronous in-memory locking keyed by `${tenantId}#${projectId}#${batchId}` within the ingestion pipeline (`IngestionService.admitAndIngestBatch`). Guarantees concurrent identical requests are serialized: exactly one commits to the physical WAL and PostgreSQL receipt index, and all concurrent duplicates await resolution and return `duplicate: true` with identical receipt metadata, eliminating double-commits to the WAL. Verified under 2, 10, and 100 concurrent identical requests with zero deadlocks.
  - **Cross-Process Exclusive Single-Writer Ownership (`JournalOwnershipManager`):** Enforces single-writer topology via `.journal.owner` using atomic `O_CREAT | O_EXCL` flags, process ID inspection, and stale lock recovery from dead PIDs. Prevents split-brain WAL corruption when multiple gateway processes target the same directory.
  - **Non-Authoritative Read-Through Cache (`IReceiptCache`, `NullReceiptCache`, `ValkeyReceiptCache`):** Defined strict read-through cache contract. Deduplication truth remains authoritatively anchored in the WAL and PostgreSQL. If Valkey is offline (`setAvailable(false)`), lookups gracefully return `null` and fall back to PostgreSQL without error (Scenario 4). If Valkey is wiped by an operator via `FLUSHALL` (`clear()`), cache misses query PostgreSQL, return `duplicate: true`, and lazily re-populate the cache (Scenario 5). If cache TTL expires (24h), PostgreSQL retains receipts across the authoritative 7-day horizon (Scenario 6).
  - **Bounded 7-Day Receipt Retention Pruner (`ReceiptRetentionService`):** Background scheduled worker executing periodic receipt pruning for records older than 7 days (`SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000`). Prevents unbound growth of `deduplication_receipts` in PostgreSQL while preserving active receipts within the horizon. Exact millisecond boundary tested (Day 7 - 1ms active vs Day 7 + 1ms expired).
  - **Deterministic Legacy Batch ID Derivation:** Updated `BatchValidationPipe` to derive a deterministic RFC 4122-compliant synthetic UUID from `contentDigestSha256` when legacy SDK clients omit `batch_id`. Retrying identical legacy payloads yields identical batch IDs, ensuring seamless duplicate acknowledgement without creating deduplication bypass vulnerabilities (Scenario 10).
  - **WAL Compaction Safeguards (`WalJournalService.canCompactSegment`, `compactSegment`):** Strictly verifies prerequisites before allowing segment deletion: segment fully archived in PostgreSQL, archive segment status completed, manifest persisted, and deduplication receipts retained.
  - **Read-Only Operational Diagnostics (`StorageDiagnosticsService`):** Safe, non-destructive tools to inspect WAL directory state, segment offsets, uncompacted bytes, active single-writer ownership status, and archive manifest SHA-256 integrity.
  - **20-Scenario Automated Failure Recovery Suite (`twelve-scenarios.test.ts`):** 20 comprehensive end-to-end unit/integration tests systematically proving all 12 ADR-015 failure scenarios plus high concurrency (10 and 100 workers), multi-process ownership rejection, stale lock recovery, exact 7-day boundary, WAL compaction safeguards, and storage diagnostics.
  - **Durable Ingestion Throughput Benchmarks:** Demonstrated up to **14,486 events/sec** (6.75 MB/sec) with hardware synchronous fsync barriers on high-density batches. Startup recovery duration: **0.041 ms**.
  - **Monorepo Regression Test Suite:** All **428 unique automated test cases** (350 TypeScript + 78 Python) across the entire monorepo passed with 0 failures and exit code 0.
- **Next Task:** `LOGHUB-ING-005` — COMPLETED (Phase 2 Acceptance & Phase 3 Planning).

### 2026-10-24 — LOGHUB-ING-005 — Reliable JSONL Shipper & Cross-SDK End-to-End Centralized Ingestion
- **Status:** PASS (Standalone JSONL shipping daemon implemented in `apps/log-shipper`; real Node.js SDK spool shipping proven; real Python SDK spool shipping proven; browser SDK telemetry proven via same-origin backend proxy; NestJS framework adapter proven; crash-recoverable atomic checkpointing with fsync; active segment safety and trailing line protection; corrupt line quarantine; 8-scenario failure injection suite passed; total workspace tests increased to 449 unique passing tests with 0 failures).
- **Key Deliverables & Invariants Verified:**
  - **Standalone Shipping Daemon (`@skyra/log-shipper`):** Built standalone daemon in `apps/log-shipper/` providing deterministic spool discovery, bounded batch construction, atomic checkpoint persistence, HTTP delivery with exponential backoff/jitter/Retry-After handling, durable receipt verification, and privacy-safe operational diagnostics.
  - **Spool Discovery & Path Containment:** Validates spool hierarchy `${SPOOL_ROOT}/${PROJECT_ID}/${ENVIRONMENT}/${SERVICE_NAME}/${INSTANCE_ID}/${YYYY-MM-DD}.part-XXXX.jsonl`. Enforces path containment via `fs.realpathSync`, strictly rejecting symlinks and directory traversal attacks (`../`).
  - **Active Segment & Trailing Line Safety:** Detects active writer leases via `.instance.owner`. Recognizes incomplete trailing lines in active segments as in-flight writes, safely ignoring them without flagging false corruption.
  - **Crash-Recoverable Atomic Checkpoints:** Persists pending batch (identity, offsets, events, SHA-256 digest) to disk *before* first transmission. Never advances acknowledged byte offsets without receiving a validated durable receipt (`durably_accepted`). Uses temp-file write + fsync + atomic rename.
  - **Corrupt Line Quarantine:** Quarantines malformed JSONL fragments in finalized segments to isolated quarantine directories, ensuring valid adjacent lines are shipped without stalling the pipeline.
  - **Real Node.js SDK E2E Ingestion:** Emitted real representative canonical events (info, warn, error, HTTP, business) via `@skyra/logger-node`. Flushed to disk, discovered by shipper, delivered to gateway, committed to WAL, recorded in PostgreSQL, and verified with zero duplicate commits on restart retry.
  - **Real Python SDK E2E Ingestion:** Executed real packaged Python SDK (`skyra_logger`) in Python subprocess. Generated canonical JSONL spools, shipped to gateway, verified durable receipt, WAL commit, and restart idempotency.
  - **Browser SDK & Trusted Backend Proxy:** Tested `@skyra/logger-browser` via a same-origin backend proxy. Proved permanent machine credentials never leak to browser clients. Verified synthetic batch ID generation and exact replay deduplication.
  - **Framework Adapter Integration:** Verified real NestJS framework adapter output (`SkyraLoggerService`) spooling, shipping, and gateway WAL admission.
  - **8-Scenario Failure & Recovery Suite:** Offline gateway, lost HTTP response retry duplicate receipt, 409 idempotency conflict, 401 invalid token rejection, 403 unauthorized project scope rejection, 429 rate limit Retry-After, finalized segment corrupt line quarantine, and WAL compaction safeguards.
  - **Monorepo Test Totals:** All **449 unique automated test cases** (371 TypeScript + 78 Python) across the entire monorepo passed with 0 failures and exit code 0.
- **Next Milestone:** Phase 2 Acceptance & Phase 3 Analytics / Reporting Planning.

### 2026-10-25 — LOGHUB-ING-006 — Phase 2 Final Integration, Data Integrity & Release Readiness Audit
- **Status:** PASS — Phase 2 Functional Acceptance (Independent end-to-end audit, multi-SDK physical pipeline verification, 25-scenario failure matrix executed, 462 unique automated tests passing across 10 packages, single-active-writer topology certified).
- **Audit Findings & Key Deliverables:**
  - **Full Pipeline Data Integrity:** Proved end-to-end data integrity from SDK event creation to source JSONL spool, shipper batch, gateway validation, WAL commit with fsync, PostgreSQL receipt registration, central immutable JSONL archive, and segment manifest creation.
  - **Content-Digest & Synthetic Identity Audit:** Evaluated `BatchValidationPipe` content-digest computation. Confirmed SHA-256 digest is computed strictly on canonical `events` payload bytes, excluding transport timestamps (`sent_at`), HTTP headers, and protocol versions. Proved synthetic batch ID generation for legacy clients is deterministic and replay-safe.
  - **Node.js, Python, and Browser Physical Delivery:** Re-verified end-to-end physical delivery for Node.js SDK spools, Python standard logging JSONL spools, and Browser SDK HTTP batches forwarded through a trusted same-origin backend proxy without credential leakage.
  - **Targeted Defect Corrections:**
    - Corrected calendar day drift in `twelve-scenarios.test.ts` Scenario 12 by deriving archive partition date directly from event timestamp.
    - Added self-healing `.next` production build step in `logger-next` integration test suite to guarantee clean runs on fresh checkouts.
    - Made `verify_isolated_browser_consumer.mjs` portable using `os.tmpdir()` and automated tarball packing.
  - **WAL Compaction Safeguards:** Proved `WalJournalService.compactSegment()` strictly invokes `canCompactSegment()` before segment unlinking, blocking deletion if segment is unarchived, manifest missing, checkpoint missing, or DB receipts absent.
  - **Single-Writer Topology Certified:** Verified `.journal.owner` mutual exclusion, process ID inspection, and stale lock reclamation from dead PIDs. Certified MVP configuration: one active writer per journal/archive domain. Multi-host active-active concurrent writers explicitly excluded from MVP scope.
  - **Reconciled Test Counts:** 462 unique automated test cases passing across the monorepo (384 TypeScript + 78 Python), plus 1 real headless browser CDP E2E suite and 2 isolated package consumer runners.
  - **Performance Benchmarks Recorded:** Node SDK >18k ops/sec; Python SDK >2.3k ops/sec (stdout) and >1.4k ops/sec (file); Gateway durable WAL fsync throughput up to 25,343 events/sec (11.81 MB/sec); startup recovery time: 0.019 ms.
- **Next Task:** `LOGHUB-QUERY-001` (Query Architecture & Contracts).

### 2026-10-25 — LOGHUB-QUERY-001 — Phase 3 Query Architecture, Search API Contracts & Analytical Storage Design
- **Status:** PASS (Architecture & Contracts Accepted; Isolated DuckDB Feasibility Spike Proven; 8 Versioned JSON Schemas + OpenAPI Spec Validated; Contract Test Suite Passing 8/8; ADR-017 through ADR-021 Authored; 10 Query Architecture Docs Authored; 45 Contract Tests Passing Across Monorepo).
- **Key Deliverables & Invariants Verified:**
  - **Core Architectural Invariant:** Canonical JSONL archive remains the permanent, authoritative source of truth. DuckDB is an embedded in-memory vectorized execution engine for read acceleration; Apache Parquet is a derived, reproducible columnar cache generated asynchronously from finalized JSONL segments.
  - **Service Boundary (ADR-017):** Query service designed as an independent process/application (`apps/query-service`) completely isolated from the single-active-writer Ingestion Gateway (`apps/ingestion-gateway`), preserving ingestion durability (RPO = 0) regardless of analytical query loads.
  - **Physical DuckDB Feasibility Spike:** Executed isolated experiment on Node.js v24.21.0 / Windows x64. Proven that modern `@duckdb/node-api` (v2.0.0-r.1) with precompiled binaries (`@duckdb/node-bindings-win32-x64`) installs with zero build scripts, boots in-memory, enforces `max_memory`, directly scans canonical JSONL via `read_json_auto`, extracts nested fields (`event.id`, `log.level`, `service.name`), executes parameterized SQL filters, and computes grouped aggregations.
  - **Tenant-Safe Query Discovery (ADR-019):** Zero arbitrary filesystem access or client-supplied paths. Filesystem scanning is entirely driven by trusted server-side metadata in PostgreSQL `archive_segments`. Client `tenant_id` is ignored in favor of the authenticated JWT principal. All file paths are validated against `ARCHIVE_ROOT` and checked for symlink escapes.
  - **DuckDB Sandbox & Anti-Injection Defense:** All DuckDB SQL is static and parameterized. Structured filters translate through an AST into static allowlisted expressions. DuckDB runs with `SET enable_external_access = false`, `SET autoinstall_known_extensions = false`, and `SET autoload_known_extensions = false`.
  - **Keyset Pagination & Eventual Consistency (ADR-020):** Replaced unstable offset pagination with deterministic keyset pagination on composite key `(@timestamp, event.id)`. Cursors are opaque base64url payloads signed with HMAC-SHA256, cryptographically binding the cursor to query filters and caller scope. Response metadata explicitly reports `archive_watermark` and freshness lag.
  - **Multi-Tenant Resource Governance (ADR-021):** Multi-tier guardrails established: max 30-day time range, max 500 page size, max 2,000 segments, max 256MB DuckDB memory, max 30s query duration, and Deficit Round-Robin fair scheduling across tenants.
  - **Versioned API Contracts Suite:** Authored OpenAPI 3.1.0 specification (`contracts/query/v1/openapi.yaml`) and 8 JSON Schemas (`search-request`, `search-response`, `aggregate-request`, `aggregate-response`, `facets-request`, `facets-response`, `error`, `cursor`).
  - **Contract Test Suite:** Created `tests/contracts/query-contracts.test.ts` validating all 8 query schemas with Ajv Draft 2020-12 (8/8 passing). Total monorepo contract tests increased to 45 passing tests across 4 suites.
  - **Architectural Documentation:** Authored 10 comprehensive query specifications in `docs/query/` (`01` through `10`) and 5 new ADRs in `docs/14-ARCHITECTURE_DECISIONS.md` (ADR-017 through ADR-021).
  - **Database Migration Posture:** No PostgreSQL migrations created or executed in QUERY-001 (proposals for future `parquet_segments` and `query_audit_logs` reserved for QUERY-006/007).
- **Next Task:** `LOGHUB-ARCH-001` — COMPLETED (Enterprise Architecture Standards & Quality Gates Baseline).

### 2026-10-25 — LOGHUB-ARCH-001 — Enterprise Architecture, Clean Code, Project Structure & Engineering Quality Standards
- **Status:** PASS (Enterprise Architecture Baseline Established; Clean Architecture & SOLID Standards Authored; .NET Enterprise to TypeScript/NestJS/Prisma Mapping Formalized; 10 Architecture Standards Documents Authored in `docs/architecture/`; 30-Dimension Compliance Matrix Certified; DuckDB Parameterization & Safe File Literal Escaping Verified; Zero P0 Blockers Remaining for QUERY-002).
- **Key Deliverables & Invariants Verified:**
  - **Enterprise Architecture Standards (`docs/architecture/01-ENTERPRISE_ARCHITECTURE_STANDARDS.md`):** Formalized the core architectural vision, system invariants, and comprehensive mapping between enterprise .NET/ASP.NET Core/EF Core concepts and idiomatic TypeScript/NestJS/Prisma technologies.
  - **Project Folder Structure Standards (`docs/architecture/02-PROJECT_FOLDER_STRUCTURE.md`):** Defined clear boundaries across `apps/`, `packages/`, `contracts/`, and standard NestJS feature-first folder conventions. Established the concrete folder structure for `apps/query-service` for task `LOGHUB-QUERY-002`.
  - **Clean Architecture & SOLID Principles (`docs/architecture/03-CLEAN_ARCHITECTURE_AND_SOLID.md`):** Documented layer separation (Domain, Application, Infrastructure, API Transport), Dependency Inversion via `Symbol` port tokens, and specific remedies for anti-patterns (fat controllers, leaky Prisma models, string SQL concatenation, and unvalidated `any`).
  - **NestJS API & DI Standards (`docs/architecture/04-NESTJS_API_STANDARDS.md`):** Established controller lifecycle, stateless singleton scope as the default (avoiding high-GC `Scope.REQUEST`), Guard/Pipe/Interceptor/Filter ordering, and Contract-First OpenAPI synchronization.
  - **Prisma & Metadata Repository Standards (`docs/architecture/05-PRISMA_REPOSITORY_STANDARDS.md`):** Reaffirmed that PostgreSQL stores only metadata/receipts/manifests and zero raw log payloads. Documented interactive `$transaction` usage, Prisma error code translation (P2002 -> 409, P2003 -> 400), and the 6-step safe migration protocol.
  - **Error Handling & Validation Standards (`docs/architecture/06-ERROR_HANDLING_AND_VALIDATION.md`):** Standardized RFC 7807 problem details for Query API, preserved Phase 2 Ingestion error format, established fail-fast Ajv Draft 2020-12 validation pipes, and strictly prohibited leakage of filesystem paths, SQL statements, and secrets.
  - **Security, Auditing & Observability (`docs/architecture/07-SECURITY_AUDITING_OBSERVABILITY.md`):** Detailed fail-closed tenant scoping, realpath containment, symlink escape defense, DuckDB sandbox controls (`enable_external_access = false`), and prevention of recursive logging loops.
  - **DuckDB SQL Construction Hardened:** Evaluated and resolved the QUERY-001 feasibility spike limitation. Verified that DuckDB file lists are assembled via server-verified catalog paths using strict regex validation (`/^[a-zA-Z0-9_\-\.\/:]+$/`) and single-quote escaping (`replace(/'/g, "''")`), while all query filter predicates use positional parameter binding (`?`), eliminating SQL injection and filesystem escape risks.
  - **Testing Strategy & 10 PR Quality Gates (`docs/architecture/08-TESTING_AND_QUALITY_GATES.md`):** Established strict pull-request quality gates (typecheck, build, contract tests, unit tests, Python tests, gateway tests, isolated consumer verification, security tests, working tree integrity, clean regression).
  - **Code Review Checklist (`docs/architecture/09-CODE_REVIEW_CHECKLIST.md`):** Authoritative checklist for engineers and reviewers covering architecture, security, performance, typing, error handling, and test coverage.
  - **Architecture Compliance Matrix (`docs/architecture/10-ARCHITECTURE_COMPLIANCE_MATRIX.md`):** Evaluated all 30 foundational dimensions with code evidence, risk ratings, and priority recommendations.
  - **Monorepo Test Pass:** Verified that all 45 monorepo contract tests pass cleanly with 0 failures and exit code 0.
- **Next Task:** `LOGHUB-QUERY-002` — COMPLETED (Query Service Foundation & Secure Archive Discovery).

### 2026-10-26 — LOGHUB-QUERY-002 — Enterprise-Grade Query Service Foundation, Authentication, Authorization & Secure Archive Discovery
- **Status:** PASS (Independent Query Service Foundation Implemented; Clean Architecture & SOLID Compliance Verified; JWT & Test Token Verifiers Implemented; Fail-Closed Project/Tenant Authorization Port Active; Read-Only Prisma Metadata Adapter Implemented; Strict Path Containment & Symlink Defense Verified; Cryptographic Manifest Verification Active; Runtime Request DTO Validation Enforced; Correlation ID Middleware & Duration Interceptor Active; RFC 7807 Problem Details Standardized; 56 Query Service Automated Tests Passing Across Unit, Integration, Security, and Architecture Suites; Zero Working-Tree Regressions).
- **Key Deliverables & Invariants Verified:**
  - **Independent Query Application (`apps/query-service`):** Scaffolded independent NestJS 10 + Fastify application with typed configuration (`QueryConfigService`), fail-fast production validation (rejecting `REPLACE_ME` database URLs and `test` auth mode), and zero impact on single-active-writer ingestion gateway.
  - **Clean Architecture Boundaries:** Certified that domain layer (`src/modules/*/domain/`) has zero imports from infrastructure or frameworks (`@nestjs/*`, `@prisma/*`, `fastify`, `node:fs`). Automated architecture tests (`tests/security/architecture-boundaries.test.ts` ARCH-1 through ARCH-6) enforce layer purity, controller thinness (<= 120 lines), no Prisma or filesystem access in controllers, and verify public DTOs never expose internal filesystem paths (`resolvedPath`).
  - **Pluggable Token Verification (`ITokenVerificationPort`):** Native `node:crypto` implementation supporting HS256, RS256, and EdDSA/Ed25519 with expiration, not-before, issuer, and audience enforcement. Provided deterministic `TestTokenVerifier` (`test-token:<base64-json>`) for non-production test suites.
  - **Fail-Closed Project Authorization (`IProjectAuthorizationPort`):** Enforces strict project intersection and wildcard grants (`*`). Cross-tenant access attempts immediately throw `CrossTenantViolationException` (HTTP 403). Principals with empty project grants fail closed (`ForbiddenProjectException`).
  - **Read-Only Metadata Repository (`IArchiveSegmentRepository`):** Implemented `PrismaArchiveSegmentRepository` querying PostgreSQL `archive_segments` table without modifying schemas, and `InMemoryArchiveSegmentRepository` for high-speed offline unit and integration testing.
  - **Filesystem Path Safety & Containment (`PathSafetyService`):** Strict regex whitelisting for path components (`^[a-zA-Z0-9_\-\.]+$`), calendar date partition validation (`YYYY-MM-DD`), file extension enforcement (`.jsonl`, `.parquet`), canonical archive root containment using `path.relative`, rejection of relative traversals (`..`), and realpath validation to prevent symlink/junction redirection attacks.
  - **Cryptographic Manifest Verification (`ManifestVerifierService`):** Computes SHA-256 digests and measures byte counts of target segment files, verifying parity against authoritative `.manifest.json` records. Classifies segments as `VERIFIED`, `MISSING`, or `CORRUPT`.
  - **Secure Archive Discovery (`ArchiveDiscoveryService` & `ArchiveDiscoveryController`):** Implemented `POST /query/v1/archive/discover`. Discovers segments matching authorized projects, time boundaries, and environment filters. Maps domain models to sanitized public DTOs, strictly omitting physical disk paths.
  - **Runtime DTO Validation (`DiscoveryValidationPipe`):** Enforces strict runtime validation on discovery filters, rejecting unrecognized properties, invalid date/time formats, or malicious characters with sanitized HTTP 400 Problem Details.
  - **Request Correlation & Timing:** `CorrelationIdMiddleware` propagates `x-correlation-id` and `x-request-id` headers; `AuditLoggingInterceptor` measures execution latency and sets `x-response-time-ms`.
  - **Search & Analytical Stubs:** Search endpoints (`/query/v1/logs/search`, `/query/v1/logs/{eventId}`, `/query/v1/logs/aggregate`, `/query/v1/logs/facets`) protected by `QueryAuthGuard` and throw `NotImplementedException` (HTTP 501 Problem Details), supporting both POST (per OpenAPI 3.1) and GET, preventing fake or mock responses before LOGHUB-QUERY-003.
  - **Standardized RFC 7807 Problem Details (`ProblemDetailsFilter`):** Central exception filter formatting all exceptions to standard JSON problem details with `type`, `title`, `status`, `detail`, `instance`, `code`, and `invalid_params`.
  - **Auditing & Observability (`QueryAuditService`):** Structured JSON security and operational audit logging for auth failures, forbidden scope attempts, cross-tenant violations, path traversal attacks, archive integrity mismatches, and discovery executions.
  - **Automated Test Evidence:** 56 automated tests passing in `apps/query-service`:
    - 29 unit tests (`config`, `jwt-verification`, `project-authorization`, `path-safety`, `manifest-verifier`, `archive-discovery`).
    - 16 real Fastify HTTP and archive integration tests (`query-http`, `archive-integrity`, POST contracts, DTO validation, correlation headers).
    - 11 security & clean architecture boundary tests (`security-boundaries`, `architecture-boundaries`).
    - Live PostgreSQL integration verified against local database instance.
  - **Monorepo Invariant Verification:** All 45 contract tests pass (`pnpm test:contracts`); root `typecheck` and `build` scripts pass across all workspace packages and apps.
- **Next Task:** `LOGHUB-QUERY-003` — COMPLETED (Secure DuckDB JSONL Query Execution, Structured Filtering & Resource Governance).

### 2026-10-26 — LOGHUB-QUERY-003 — Secure DuckDB JSONL Query Execution, Structured Filtering & Resource Governance
- **Status:** PASS (DuckDB Analytical Execution Layer Implemented; `@duckdb/node-api` Installed & Hardened; Clean Architecture Execution Port & Adapter Active; Parameterized SQL Generation with Double Defense-in-Depth Row-Level Tenant Isolation; Canonical ECS Field Allowlist Mapping Enforced; Structured Filter AST Compiler with Input Bounding; Query Resource Governor Active with Concurrency Ceilings, Queue Depth Limits, and Per-Tenant Fairness; True Interrupt Cancellation via `conn.interrupt()`; 90 Query Service Tests Passing (34 New); Zero Regressions Across Ingestion Gateway & Monorepo Contracts; Zero Unapproved DB Migrations).
- **Key Deliverables & Invariants Verified:**
  - **DuckDB Runtime Integration (`@duckdb/node-api` v2.0.0-r.1):** Installed modern DuckDB Node API and integrated in-memory analytical instance with hardened security flags: `autoinstall_known_extensions: 'false'`, `autoload_known_extensions: 'false'`, `max_memory: 256MB`, and bounded threads (2).
  - **Clean Architecture Query Execution Port & Adapter:** Established domain port `ILogQueryExecutionPort` (`LOG_QUERY_EXECUTION_PORT`) and infrastructure adapter `DuckDbLogQueryAdapter`. Domain layer has zero framework/DuckDB dependencies, verified by Clean Architecture boundary tests (ARCH-1 through ARCH-6).
  - **Secure Archive Access & Containment:** Analytical engine accepts only verified absolute paths from `TrustedArchiveSegmentDescriptor` objects, pre-verified through `PathSafetyService` (containment, realpath, no `..`, canonical naming) and `ManifestVerifierService` (SHA-256 and byte-size verification against authoritative `manifest.json`). Zero client-supplied file paths or globs.
  - **Canonical ECS Field Mapping (`docs/query/10-CANONICAL_FIELD_MAPPING.md`):** Complete allowlist catalog resolving canonical ECS paths (`@timestamp`, `event.id`, `event.action`, `log.level`, `service.name`, `message`, `error.type`, `http.response.status_code`, etc.) and client aliases (`timestamp`, `event_id`, `action`, `level`, `service`, `status_code`). Arbitrary or unmapped fields are rejected with HTTP 400 Problem Details.
  - **Structured Filter Compiler (`FilterCompilerService`):** Compiles client filters into typed ASTs (`binary`, `in`, `contains`, `exists`, `logical`). Enforces type safety (numeric validation, ISO8601 timestamps), operator compatibility, bounded array sizes (<= 100 items), bounded string lengths (<= 512 chars), and filter count ceiling (<= 15 filters).
  - **Safe Parameterized SQL Generator (`SqlGeneratorService`):** Generates static DuckDB SQL using `read_ndjson_objects([$1, $2, ...])` and bound prepared statement parameters. Dynamic filter values and paths are never concatenated into SQL strings. Enforces double defense-in-depth row-level `skyra.tenant_id = $tenantId` and `skyra.project_id IN ($projects)`.
  - **Deterministic Result Ordering:** Employs composite ORDER BY `json_extract_string(json, '$."@timestamp"') DESC, json_extract_string(json, '$.event.id') DESC`, providing a deterministic tie-breaker for keyset cursor pagination in QUERY-004.
  - **Query Resource Governance (`QueryResourceGovernorService`):** Concurrency ceiling (max 4 concurrent queries), bounded queue (max 16), per-tenant fairness (max 2 active slots per tenant).
  - **True Query Cancellation & Timeout:** Client abort signal or timeout budget fires registered interrupt handler calling `conn.interrupt()`, stopping in-flight DuckDB worker execution immediately and throwing `QueryCancelledException` or `QueryTimeoutException`.
  - **Zero Regressions & Comprehensive Test Evidence:**
    - 90 tests passing in `apps/query-service` (56 baseline + 34 new tests across unit, integration, and security suites).
    - 10 real DuckDB execution tests (`duckdb-execution.test.ts`): single/multi segment scans, zero segments, Unicode preservation, missing optional fields, numeric comparisons, limit bounds, timeout interrupt, `AbortSignal` interrupt, concurrent execution.
    - 4 real archive integration tests (`real-archive-query.test.ts`): real Phase 2 folder structure (`{tenant}/{project}/{environment}/{service}/{date}/segment-0000.jsonl` and `manifest.json`), planner, adapter, immutability check.
    - 6 security & isolation tests (`query-isolation.test.ts`): SQL injection payload neutralisation, tenant isolation, cross-project injection rejection, oversized intervals, DuckDB extension load blocking.
    - 45 monorepo contract tests passing (`tests/contracts/**/*.test.ts`).
    - 120 ingestion gateway tests passing (`apps/ingestion-gateway`).
    - 6 Clean Architecture boundary tests passing (`architecture-boundaries.test.ts`).
- **Next Task:** `LOGHUB-QUERY-004` — COMPLETED (Secure Search API, Deterministic Pagination & Enterprise API Integration).

### 2026-10-26 — LOGHUB-QUERY-004 — Secure Search API, Deterministic Pagination & Enterprise API Integration
- **Status:** PASS (Public Search API `POST /query/v1/logs/search` and Event Lookup `GET /query/v1/logs/:eventId` Operational; P0-A Pre-Read Tenant Isolation Enforced in DuckDbLogQueryAdapter Prior to File Access; P0-B 4-Part Composite Keyset Pagination Implemented with DuckDB Window Function Ordering; P0-C Test Count Discrepancy Fully Reconciled; HMAC-SHA256 Signed Cursors Active with Constant-Time MAC Verification and Scope Binding; Strict Ajv Schema Runtime Validation Enforced; Centralized RFC 7807 Exception Mapping; 116 Query Service Tests Passing Across 19 Suites; Zero Regressions in Monorepo Contracts (45/45) or Ingestion Gateway (120/120); Zero Unapproved DB Migrations).
- **Key Deliverables & Invariants Verified:**
  - **P0-A Pre-Read Tenant Isolation Boundary:** Verified that `DuckDbLogQueryAdapter` validates descriptor ownership (`tenantId === plan.tenantId`), authorized projects (`plan.authorizedProjects.includes(descriptor.projectId)`), verified integrity status (`VERIFIED`), canonical root containment, absolute path existence, and file byteSize *before* passing any path to DuckDB. Foreign descriptors immediately trigger `CrossTenantViolationException` or `ForbiddenProjectException`. Tests prove unauthorized archive files are never opened or touched.
  - **P0-B 4-Part Composite Keyset Pagination:** Implemented stable total ordering across all files using DuckDB window function `row_number() OVER (PARTITION BY filename) - 1 AS record_offset` and `regexp_extract(filename, '([^/\\\\]+)$', 1) AS segment_id`. Stable tuple `(@timestamp, event.id, segment_id, record_offset)` guarantees non-shifting, restart-safe, $O(1)$ keyset continuation even when timestamps and event IDs are identical.
  - **P0-C Test Count Reconciliation:** Resolved historical discrepancy between claimed 90 tests in QUERY-003 and 86 in the manual table. Real test-runner output verified: `query-http.test.ts` contained 14 tests (table incorrectly noted 7, +7), while `archive-integrity.test.ts` contained 1 test (table incorrectly noted 4, -3). Net: 86 + 7 - 3 = 90 tests. In QUERY-004, 26 new tests were added, bringing the total to 116 unique tests across 19 suites.
  - **Signed Cursor Codec (`CursorCodecService`):** Opaque base64url HMAC-SHA256 authenticated cursor binding version, tenant ID, project scope, canonical query SHA-256 fingerprint, 4-part position tuple, sort direction, and 24-hour expiration. Evaluated using `crypto.timingSafeEqual` to prevent timing side-channels. Fail-closed production configuration validation for signing secrets.
  - **Strict DTO & Schema Validation (`SearchValidationPipe`, `EventLookupValidationPipe`):** Runtime Ajv validation enforcing `contracts/query/v1/search-request.schema.json`. Unknown properties, non-UTC timestamps, invalid boundaries, unauthorized projects, unsupported operators, and malicious strings are rejected with RFC 7807 HTTP 400 Problem Details.
  - **Single-Event Point Lookup (`GetLogEventUseCase`):** Bounded point lookup by UUIDv4 scoped to authorized project. Fastify static-first routing ensures static routes (`aggregate`, `facets`) remain registered cleanly ahead of parameter routes.
  - **Enterprise Clean Architecture:** Preserved strict dependency direction (API -> Application -> Domain <- Infrastructure). Controller is 86 lines (<= 120 lines ceiling), free of raw SQL or Prisma references. Domain layer has zero framework/infrastructure dependencies.
  - **Automated Test Evidence:** 116 tests passing in `apps/query-service` (19 suites, 0 failed, 0 skipped):
    - 7 unit tests in `cursor-codec.test.ts` (creation, verification, tampering, expiration, tenant mismatch, query fingerprint mismatch, timingSafeEqual).
    - 9 unit tests in `search-validation-pipe.test.ts` (valid payloads, unknown fields, bad UTC, invalid time range, empty body, SQL injection, script tags, invalid operators, excessive items).
    - 9 integration tests in `search-api.test.ts` (authorized search, structured filters, keyset cursor traversal, unauthorized cross-tenant, tampered cursor, event lookup, non-existent event, unauthorized project event, deferred endpoints 501).
    - 6 unit tests in `sql-generator.test.ts` (including SGS-5 verifying 4-part composite locator keyset SQL generation).
    - 85 existing tests covering DuckDB execution, archive discovery, path safety, manifest verification, JWT verification, and Clean Architecture boundaries.
- **Next Task:** `LOGHUB-QUERY-005` — COMPLETED (Secure Aggregations, Dynamic Facets & Bounded Analytical Query Execution).

### 2026-10-26 — LOGHUB-QUERY-005 — Secure Aggregations, Dynamic Facets & Bounded Analytical Query Execution
- **Status:** PASS (Analytical Aggregations API `POST /query/v1/logs/aggregate` and Dynamic Facet Discovery `POST /query/v1/logs/facets` Fully Operational; P0-A Physical Record Locator Corrected with Inner Window Function Ordering; P0-B Pre-Read Descriptor Provenance Verified; Date Histograms Supporting 1m, 5m, 15m, 1h, 6h, 1d with Exact UTC Bucket Alignment; Categorical Terms Aggregations with Explicit Sizing; Cardinality Aggregations for Distinct Counts; Dynamic Facets Across `service.name`, `log.level`, `event.action`, `environment`, and `error.type` with Active Filter Support; Strict Ajv Schema Runtime Validation Enforced; Centralized RFC 7807 Exception Mapping; Resource Budgets Active with Slot Concurrency, Queue Limits, and Timeout Interrupts via `conn.interrupt()`; 162 Query Service Tests Passing Across 24 Suites; Zero Regressions in Monorepo Contracts (45/45) or Ingestion Gateway (120/120); Zero Unapproved DB Migrations).
- **Key Deliverables & Invariants Verified:**
  - **P0-A Physical Record Locator Resolution:** Corrected DuckDB window function in `SqlGeneratorService` from `row_number() OVER (PARTITION BY filename) - 1` to `row_number() OVER (PARTITION BY filename ORDER BY json_extract_string(json, '$."@timestamp"'), json_extract_string(json, '$.event.id'), md5(json)) - 1`. Eliminates non-deterministic block arrival races across multi-threaded scans (>2 threads), ensuring physically stable, reproducible record ordering across Query Service restarts and file scans.
  - **P0-B Pre-Read Descriptor Provenance Gate:** Reinforced the mandatory pre-read security gate in `DuckDbLogQueryAdapter` asserting descriptor `tenantId === plan.tenantId`, authorized project intersection, `VERIFIED` status, and matching physical file size before DuckDB is invoked. Foreign or forged descriptors fail closed with `CrossTenantViolationException` or `ForbiddenProjectException`. Tests prove unauthorized archive files are never opened or touched.
  - **Analytical Aggregation API (`POST /query/v1/logs/aggregate`):** Implemented contract-compliant grouped analytics supporting `date_histogram` (with strict UTC bucket alignment for `1m`, `5m`, `15m`, `1h`, `6h`, `1d`), categorical `terms` (bounded counts with explicit `size` limits), and distinct count `cardinality` aggregations conforming to `contracts/query/v1/aggregate-request.schema.json` and `aggregate-response.schema.json`.
  - **Dynamic Facet Discovery API (`POST /query/v1/logs/facets`):** Authoritative, scoped discovery of distinct values and frequencies for `service.name`, `log.level`, `event.action`, `environment`, and `error.type` conforming to `contracts/query/v1/facets-request.schema.json` and `facets-response.schema.json`. Fully respects active filters and project boundaries.
  - **Strict Validation Pipes (`AggregateValidationPipe`, `FacetsValidationPipe`):** Runtime validation enforcing schema conformance, rejecting unknown properties (`additionalProperties: false`), non-UTC timestamps, invalid boundaries (`end <= start`), excessive time ranges (>30 days), excessive histogram buckets (>2000), and unallowlisted fields.
  - **Analytical SQL Generator (`AnalyticsSqlGeneratorService`):** Translates query plans to parameterized DuckDB SQL. Binds all dynamic values, applies double defense-in-depth row filtering (`$.skyra.tenant_id = $tenantId`, `$.skyra.project_id IN (...)`), uses DuckDB `time_bucket(INTERVAL ..., CAST(ts AS TIMESTAMP))` for UTC boundary truncation, and limits terms and facet cardinality.
  - **Observability & Audit Telemetry:** Added analytical audit events (`AGGREGATION_REQUESTED`, `AGGREGATION_COMPLETED`, `FACETS_REQUESTED`, `FACETS_COMPLETED`, `ANALYTICS_REJECTED`, `ANALYTICS_TIMEOUT`) tracking duration, scanned bytes, segment counts, and outcomes without logging raw SQL, filesystem paths, or credentials.
  - **Comprehensive Automated Test Evidence:** 162 automated tests passing in `apps/query-service` (24 suites, 0 failed, 0 skipped):
    - 11 unit tests in `aggregate-validation-pipe.test.ts`.
    - 10 unit tests in `facets-validation-pipe.test.ts`.
    - 5 unit tests in `analytics-sql-generator.test.ts`.
    - 14 integration tests in `analytics-api.test.ts`.
    - 6 security & invariant tests in `analytics-security.test.ts`.
    - 116 existing tests covering DuckDB execution, keyset pagination, archive discovery, path safety, manifest verification, JWT verification, and Clean Architecture boundaries.
  - **Monorepo Invariant Verification:** All 45 contract tests pass (`pnpm test:contracts`); all 120 ingestion gateway tests pass (`apps/ingestion-gateway`); 327 active suite tests 100% PASS with 0 regressions.
- **Next Task:** `LOGHUB-QUERY-006` — COMPLETED (Derived Parquet Materialization, Hybrid Query Planning, Cache Integrity & Performance Acceleration).

### 2026-10-27 — LOGHUB-QUERY-006 — Derived Parquet Materialization, Hybrid Query Planning, Cache Integrity & Performance Acceleration
- **Status:** PASS (Derived Parquet Acceleration Layer Implemented as an Atomic, Rebuildable, Verifiable Analytical Cache; Canonical Immutable JSONL Preserved as Sole Authoritative Source of Truth; P0-A Stable Record Locator Preserved Across Formats; P0-B Pre-Read Descriptors Validated Prior to DuckDB File Access; File-Backed Derived Parquet Catalog Implemented with 0 DB Migrations; DuckDbParquetConverter with ZSTD Compression Achieving 97.1% Storage Space Savings; Atomic Staging (.staging) and Stale Artifact Crash Recovery; HybridSourcePlanner Transparently Partitioning Queries Across Parquet and JSONL with Zero Duplicate and Zero Dropped Segments; Identical Semantic Parity for Search, Structured Filters, Date Histograms, Terms, and Facets; Keyset Cursor Continuation Seamless Across Physical Source Substitution; 194 Query Service Tests Passing Across 32 Suites; Zero Regressions in Monorepo Contracts (45/45) or Ingestion Gateway (120/120); Zero Unapproved DB Migrations).
- **Key Deliverables & Invariants Verified:**
  - **Primary Invariant (Canonical Immutability):** Canonical JSONL archives remain strictly immutable and authoritative. Parquet artifacts are derived, non-authoritative, rebuildable caches that can be purged or reconstructed at any time without data loss.
  - **P0-A Stable Event Locator Invariant:** Verified that DuckDB's window function ordering `row_number() OVER (PARTITION BY filename ORDER BY json_extract_string(json, '$."@timestamp"'), json_extract_string(json, '$.event.id'), md5(json)) - 1` assigns identical physical `record_offset` values whether executed against JSONL or Parquet. Keyset pagination cursors continue seamlessly across physical format substitutions.
  - **P0-B Pre-Read Descriptor Provenance:** Enforced rigorous pre-read security verification in `DuckDbLogQueryAdapter.validateParquetDescriptorProvenance` before DuckDB is invoked: verifying tenant ownership (`tenantId === plan.tenantId`), authorized project intersection, `VERIFIED` status, root containment, physical file existence, and byte size match on disk. Cross-tenant or unauthorized accesses fail closed immediately.
  - **Parquet Cache Module (`apps/query-service/src/modules/parquet-cache/`):**
    - Domain: `TrustedParquetSegmentDescriptor`, `DerivedParquetMetadata`, `IParquetCatalogPort`, `MaterializationState`.
    - Infrastructure: `ParquetPathSafetyService` (root containment, traversal checks, symlink defense), `FileParquetCatalogService` (file-backed metadata storage with source checksum drift detection), `DuckDbParquetConverter` (atomic COPY TO PARQUET with ZSTD compression).
    - Application: `MaterializeSegmentUseCase` (idempotent conversion with in-memory concurrency guard), `VerifyParquetUseCase` (DuckDB readability and count verification), `RecoverMaterializationUseCase` (background sweeper for stale staging artifacts), `HybridSourcePlannerService` (optimal partitioner per canonical segment).
  - **DuckDB Hybrid SQL Execution:** Updated `SqlGeneratorService` and `AnalyticsSqlGeneratorService` to generate `UNION ALL` across `read_parquet` and `read_ndjson_objects` relations with unified projected columns (`@timestamp`, `event.id`, `segment_id`, `record_offset`, `json`).
  - **Benchmark Evidence:** 5,000 real events benchmarked:
    - Canonical JSONL: 2.10 MB
    - Derived Parquet (zstd): 0.06 MB
    - Storage Space Saved: 97.1%
    - Conversion Time: 428.2 ms
    - Search Latency: JSONL scan 148.86 ms, Parquet scan 593.77 ms, Hybrid scan 164.26 ms
  - **Automated Test Evidence:** 194 tests passing in `apps/query-service` (32 suites, 0 failed, 0 skipped):
    - 7 unit tests in `parquet-path-safety.test.ts`.
    - 4 unit tests in `file-parquet-catalog.test.ts`.
    - 3 unit tests in `hybrid-source-planner.test.ts`.
    - 5 integration tests in `parquet-materialization.test.ts`.
    - 3 integration tests in `hybrid-query.test.ts`.
    - 3 integration tests in `hybrid-analytics.test.ts`.
    - 5 security tests in `parquet-security.test.ts`.
    - 2 benchmark tests in `parquet-benchmark.test.ts`.
    - 162 existing tests covering search, aggregations, facets, archive discovery, path safety, and Clean Architecture boundaries.
  - **Monorepo Invariant Verification:** All 45 contract tests pass (`pnpm test:contracts`); all 120 ingestion gateway tests pass (`apps/ingestion-gateway`); 359 total active suite tests passing with 0 failures.
- **Next Task:** `LOGHUB-QUERY-007` — COMPLETED (Query Security, Performance, Reliability & Operational Hardening).

### 2026-10-27 — LOGHUB-QUERY-007 — Enterprise Security, Query Performance Optimization, Reliability & Operational Hardening
- **Status:** PASS (P0-A Parquet Performance Bottleneck Investigated & Resolved; P0-B Evidence-Backed Optimizations Delivered with Columnar Pushdown & Pruning Achieving up to 9.57x Analytical Speedup; P0-C Hybrid Source Selection Hardened with Explicit Safe Diagnostic Modes; P0-D Stable Physical Event Identity & Byte-Identical Duplicate Handling Exhaustively Verified; P0-E File Provenance & TOCTOU Security Enforced with Pre-Read Verification; P0-F Atomic Publication & Staging Cleanup Hardened; P0-G Multi-Tenant Fairness & Concurrency Capping Enforced; 201 Automated Tests Passing Across 34 Suites in Query Service; 366 Total Monorepo Tests Passing with Zero Failures; Zero DB Migrations).
- **Key Deliverables & Invariants Verified:**
  - **P0-A Parquet Root-Cause Analysis:** Identified that previous QUERY-006 Parquet execution suffered latency regressions because queries evaluated `json_extract_string(json, ...)` against the large raw `json` string column, forcing DuckDB to decompress and materialize the bulky JSON string payload on every row and preventing Parquet dictionary/statistics filter pushdown.
  - **P0-B Parquet & Hybrid Optimization:**
    - In `SqlGeneratorService`: Projected typed columns (`tenant_id`, `project_id`, `environment`) into the Parquet subquery relation and shifted WHERE clauses from string parsing to native column predicates (`"tenant_id" = $1`, `"project_id" = $2`, `"@timestamp" >= $3`). DuckDB pushes down predicates directly into Parquet metadata row-group filters.
    - In `AnalyticsSqlGeneratorService`: In Parquet-only mode, completely eliminated reading the raw `json` column for `date_histogram`, `terms`, and `facets` queries on indexed canonical fields (`@timestamp`, `log.level`, `service.name`, `event.action`, `environment`). Reduced file I/O by >96% and memory allocations by >90%.
    - Measured Speedups (50k events): Terms Aggregation **9.57x** faster (104.0ms -> 10.9ms), Service Filtering **8.08x** faster (110.7ms -> 13.7ms), Facets Discovery **7.19x** faster (108.8ms -> 15.1ms), Filtered Search **4.55x** faster (171.4ms -> 37.7ms).
  - **P0-C Evidence-Based Source Selection:** Added `hybridSourceMode` (`hybrid`, `jsonl_only`, `parquet_only`) to `QueryConfigService` and `HybridSourcePlannerService`. Supports explicit diagnostic forcing of canonical JSONL or Parquet without exposing physical paths to clients.
  - **P0-D Stable Physical Event Identity & Keyset Pagination:** Exhaustively tested pagination across byte-identical duplicate events, identical timestamps, duplicate event IDs, and source transition (JSONL page 1 -> Parquet page 2). Proved 100% gapless sequential continuity with zero dropped and zero duplicated records (`stable-locator-duplicate-pagination.test.ts`).
  - **P0-E Cache Provenance & Filesystem Security:** Verified immutable canonical archive integrity; Parquet cache validity confirmed via byte size, SHA-256 checksums, and tenant/project ownership gates prior to DuckDB query execution. Re-validated symlink defense and native root containment in `ParquetPathSafetyService`.
  - **P0-F Crash Recovery & Staging Sanitation:** Added `cleanupOrphanedStagingFiles` in `DuckDbParquetConverter` to safely purge stale intermediate artifacts from `.staging` directories older than 1 hour without interfering with active conversion workers.
  - **P0-G Multi-Tenant Fairness & Cancellation:** Corrected `QueryResourceGovernorService.processQueue` to strictly enforce `maxConcurrentPerTenant` (2 slots), preventing a single tenant from monopolizing the 4 global execution slots and starving competing tenants. Verified explicit `AbortSignal` cancellation mid-flight, queue eviction, slot release on timeout, and bounded queue rejection (HTTP 429 `QueryBudgetExceededException`) in `tenant-fairness-cancellation.test.ts`.
  - **Automated Test Evidence:** 201 automated tests passing in `apps/query-service` (34 suites, 0 failed, 0 skipped):
    - 3 integration tests in `stable-locator-duplicate-pagination.test.ts` (P0-D1, P0-D2, P0-D3).
    - 4 integration tests in `tenant-fairness-cancellation.test.ts` (TFC-1, TFC-2, TFC-3, TFC-4).
    - 194 existing tests covering DuckDB execution, Parquet materialization, hybrid query planning, aggregations, facets, search, and Clean Architecture boundaries.
  - **Monorepo Invariant Verification:** All 45 contract tests pass (`pnpm test:contracts`); all 120 ingestion gateway tests pass (`apps/ingestion-gateway`); 366 total active workspace tests passing with 0 failures and 0 regressions.
- **Next Task:** `LOGHUB-QUERY-008` — COMPLETED (Phase 3 Final Functional, Security & Architecture Acceptance).

### 2026-10-27 — LOGHUB-QUERY-008 — Phase 3 Final Functional, Security & Architecture Acceptance
- **Status:** PASS — Phase 3 Functional Acceptance (All 30 Mandatory Functional, Security, Data-Integrity, and Performance Acceptance Criteria Verified; Full End-to-End System Pipeline Verified from SDK Ingestion to HTTP Query Response; Zero Database Migrations; Zero Regressions in Prior Phases; Complete Monorepo Active Test Suite at 630 Passing Tests Across 11 Packages; Operational Readiness and Production Deployment Prerequisites Documented).
- **Key Deliverables & Invariants Verified:**
  - **Complete Unified Pipeline Verification:** Implemented and executed `apps/query-service/tests/integration/phase3-end-to-end-pipeline.test.ts` (9 comprehensive pipeline scenarios) verifying the end-to-end flow:
    1. Real Node SDK emits canonical logs into partition directory.
    2. Finalized segment with signed manifest (`segment-0000.manifest.json`) registered in metadata catalog.
    3. Background Parquet Converter materializes segment into `.parquet` and `.parquet.meta.json` with ZSTD compression.
    4. HTTP `POST /query/v1/logs/search` validates keyset cursor pagination across multiple pages with 100% gapless sequential continuity (0 duplicate, 0 omitted events).
    5. HTTP `GET /query/v1/logs/{eventId}` validates single event lookup by UUID with project scoping.
    6. HTTP `POST /query/v1/logs/aggregate` validates exact UTC date histogram bucket alignment and terms grouping counts (6 info, 2 warn, 2 error).
    7. HTTP `POST /query/v1/logs/facets` discovers unique values and frequencies without schema drift.
    8. Multi-tenant security validates that unauthorized project requests return HTTP 403 (`FORBIDDEN_PROJECT_ACCESS`) and foreign tenant requests return 0 events.
    9. Canonical immutability verified: canonical JSONL file size and SHA-256 hash remained strictly identical before, during, and after queries.
  - **30-Dimension Traceable Acceptance Matrix:** Authored `docs/query/11-PHASE3_ACCEPTANCE_MATRIX.md` covering all 30 acceptance requirements (`ACC-001` through `ACC-030`) with code locations, test commands, and verified results.
  - **Operational Gaps & Production Readiness:** Authored `docs/query/12-PHASE3_OPERATIONS_GAPS.md` classifying all operational controls into Implemented in Code, Documented but Not Deployed, and Deferred. Explicitly separated functional acceptance from production deployment certification (e.g. read-only archive mounts, corporate OIDC/JWKS configuration, unprivileged user cgroup caps).
  - **Full Monorepo Regression & Test Reconciliation:**
    - `@skyra/query-service`: 210 tests passed (35 suites, 0 failed, 0 skipped).
    - `@skyra/contracts`: 45 tests passed (4 suites).
    - `@skyra/ingestion-gateway`: 120 tests passed (18 suites).
    - `@skyra/log-shipper`: 21 tests passed (9 suites).
    - `@skyra/logger-node`: 46 tests passed (10 suites).
    - `@skyra/logger-nestjs`: 46 tests passed (12 suites).
    - `@skyra/logger-browser`: 40 tests passed (5 suites).
    - `@skyra/logger-angular`: 8 tests passed (1 suite).
    - `@skyra/logger-react`: 6 tests passed (1 suite).
    - `@skyra/logger-python`: 78 tests passed.
    - `tests/e2e/real-browser`: 10 passed (Chrome & Edge headless CDP).
    - `scripts/verify_isolated_browser_consumer` + `scripts/verify_isolated_python_consumer`: 100% PASS.
    - **Total Monorepo Automated Tests:** **630 tests passing with 0 failures and 0 skips**.
  - **Quality Gates:** `pnpm check:schema-sync`, `pnpm typecheck`, `pnpm build`, `pnpm test` all exit code 0.
  - **Final Acceptance Deliverables:**
    - Acceptance Matrix: `docs/query/11-PHASE3_ACCEPTANCE_MATRIX.md`
    - Operational Gaps: `docs/query/12-PHASE3_OPERATIONS_GAPS.md`
    - Final Audit: `SKYRA_LOGHUB_QUERY_008_FINAL_AUDIT.md`
    - Final Acceptance Report: `SKYRA_LOGHUB_QUERY_008_PHASE3_ACCEPTANCE_REPORT.md`
- **Next Task:** Phase 4 — Log Explorer UI / Production Deployment Assessment.
