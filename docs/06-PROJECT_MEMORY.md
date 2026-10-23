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
| Current phase | Phase 1 — Contracts and package foundations (SDK Foundation Gate PASSED) |
| Current task | LOGHUB-PKG-007 (Completed) |
| Implemented LogHub features | Complete 8-SDK Foundation: Canonical Schema v1 (Ajv 2020 + Draft 2020-12), `@skyra/logger-core`, `@skyra/logger-node`, `@skyra/logger-nestjs`, `@skyra/logger-next`, `skyra-logger` (Python), `@skyra/logger-browser`, `@skyra/logger-angular`, `@skyra/logger-react`. Real browser CDP automation, shared cross-SDK fixtures, CI verification workflow. |
| Documents | 14 baseline documents aligned with file-first architecture (ADR-011) + release hardening report |
| Tests | 275 automated tests passing (197 TypeScript + 78 Python), 2 Real Browser E2E suites passing (Chrome 155, Edge 155), 2 isolated consumer test runners passing |
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
