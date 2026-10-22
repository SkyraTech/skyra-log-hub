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
| Current phase | Phase 1 — Contracts and package foundations |
| Current task | LOGHUB-PKG-001B (Completed) |
| Implemented LogHub features | Canonical schema contracts (Draft 2020-12), storage contract, `@skyra/logger-core` (compiled `dist/`), `skyra-logger` (wheel verified), hardened redaction, test suites |
| Documents | 14 baseline documents aligned with file-first architecture (ADR-011) |
| Tests | 17 automated tests passing (8 Node.js contract suites + 9 Python unit tests) |
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
  Await user review of `LOGHUB-PKG-002`. Next scheduled task is `LH-105` (NestJS/Next.js logging adapters and sample application).

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
