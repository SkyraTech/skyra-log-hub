# Testing Strategy and Quality Gates

> **Product:** Skyra LogHub  |  **Status:** Proposed baseline — review before implementation  |  **Version:** 0.1-draft  |  **Date:** 2026-10-21
> **Repository:** `skyra-loghub` (renamed by project owner). Assumptions and undecided items are marked **TBD**. These documents are design specifications, not assertions that code already exists.

## 1. Objectives
Demonstrate log correctness, confidentiality, project isolation, performance fidelity, user workflows and operational recovery. **Every phase must have tests and evidence**; do not infer functionality from generated code.

## 2. Test pyramid
| Layer | Tools | Scope |
|---|---|---|
| TypeScript unit | Vitest or NestJS-compatible Jest choice (choose one per module) | Formatter, redaction, token policies, query AST |
| Python unit | pytest | Serialization, handlers, context, rotation |
| Schema contract | JSON Schema validator + golden fixtures | Cross-language identical required fields/types |
| Component | Angular TestBed + DOM accessibility checks | Field picker, query builder, results, errors |
| Integration | Testcontainers or Docker Compose | PG/central JSONL/Parquet storage and DuckDB query service/Valkey/OTel Collector, archived and partitioned events |
| E2E | Playwright | Login, scoped search, histogram, token life cycle, MCP UI interaction where applicable |
| Security | Negative suites + SAST/DAST/dependency checks | Cross-project attacks, XSS, OAuth/token misuse |
| Load/resilience | k6/Artillery/custom controlled harness | Search p95, ingestion EPS, disk/full queues, disconnect/recovery |

## 3. Canonical fixtures
Include valid HTTP request, slow DB query, job success/failure, auth denial, exception, Unicode, long messages, concurrency and UTC rollover. Invalid fixtures: duplicate JSON keys, malformed timestamps, unsafe project ID, nested secret, SQL bind parameters, oversized strings, NaN, wrong schema and spoofed project identities.

### LOGHUB-PKG-001B & PKG-001C Contract & Security Gates
1. **Schema Authority & Consistency (Draft 2020-12)**: Both TypeScript (`@skyra/logger-core` with Ajv 2020) and Python (`skyra-logger` with `jsonschema`) validate against identical JSON Schema Draft 2020-12 specifications. `ecs.version` is pinned to `8.11.0` (distinct from `skyra.schema_version` `1.0.0`), `event.id` strictly enforces RFC 4122 UUIDv4 (rejecting UUIDv1 and UUIDv7), and unrecognized top-level fields are rejected (`additionalProperties: false`).
2. **Calendar Timestamp & UTC Gate**: Timestamps must be strict RFC3339 UTC ending in `Z`. Real calendar dates are verified in both SDKs, rejecting month 13, day 32, April 31, and February 29 on non-leap years.
3. **Schema Synchronization Gate**: Embedded schemas in TypeScript and Python are checked against `contracts/schemas/v1/log-event.schema.json` via `pnpm run check:schema-sync`; drift causes CI failure.
4. **Strict Parser Hardening**: Duplicate JSON keys at root or nested levels, and Unicode escape variations (e.g., `\u0061`) must trigger strict parser errors.
5. **Redaction & Privacy Security**: Normalized case-insensitive compound key checks (`dbPassword`, `client_secret`, `access-token`), URL embedded credentials, Bearer/JWT values, and circular reference safety (`WeakMap`/visited id set) without mutating caller inputs. Validation diagnostic paths never leak sensitive payload values.
6. **Distribution & Isolated Consumer Gates**: `@skyra/logger-core` compiles to `dist/` with `.d.ts` types and passes clean consumer module and type resolution. Python wheel builds cleanly with embedded schemas and installs in isolated environments without source tree dependencies.
7. **LOGHUB-PKG-002 Node.js Logger & Daily JSONL Transport Gates**:
   - Bounded Queue & Backpressure: Memory limit (64 MiB default) and pending events limit (10,000 default). Drops non-critical logs on saturation with observable metrics; critical events (`error`, `fatal`) bypass via direct emergency write.
   - Path Safety & Instance Isolation: Strict regex verification on `projectId`, `serviceName`, `instanceId`, and log root path traversal rejection (`..`, `/`, `\`, null bytes). Single-writer instance directory isolation.
   - UTC Midnight Rollover: Injectable clock verifies rollover from `23:59:59Z` to `00:00:00Z` rotates to `${newDate}.part-0000.jsonl` with zero event loss.
   - Size Rollover: Monotonic zero-padded 4-digit segment indexing (`.part-0000.jsonl`, `.part-0001.jsonl`) at configured threshold (default 100 MiB).
   - Partial-Line Recovery: Tail scanner quarantines incomplete trailing records to `${date}.corrupt.log` and cleanly truncates prior to new writes.
   - End-to-End Consumer Verification: Built package produces physical JSONL files, and each line passes both the strict duplicate-key parser and Ajv 2020 canonical schema validator.
   - 35 automated tests in `packages/logger-node/tests/` passing across unit, storage, reliability, security, and integration suites.

## 4. Non-negotiable integration scenarios
1. Two projects with same service name cannot share log file path, file/catalog visibility or token access.
2. Day change creates new UTC file; size rollover is deterministic; collector tails correctly across rename/restart.
3. Network/central JSONL/Parquet storage and DuckDB query service outage does not stop application; drop/buffer behavior visible and bounded.
4. API latency measured with monotonic clock and nanosecond conversion; DB duration explicitly client-observed.
5. Direct ingestion authentication rejects bad/mismatched service/project mapping.
6. Revoked/expired/scope-limited token is denied immediately including through MCP.
7. Query editor rejects unbounded, unauthorized, complex or unsupported expressions.
8. Log entries containing malicious HTML/scripts appear as escaped text everywhere including exports.
9. Search/cursor cannot cross project or query boundaries.
10. Backup/restore produces usable derived Parquet files and management DB without credential resurrection.

## 5. Quality gate targets
- Proposed 85% unit coverage for logging core/security modules; branch tests for redaction/token validation mandatory. Use thresholds after baseline measurements.
- Zero failing critical security suites; schema contracts green across Node and Python; nonblocking logging performance regression benchmark.
- **Node.js Logging SDK Quality Gates (LOGHUB-PKG-002A):**
  1. *Single-Writer Integrity*: Zero concurrent writes to the file descriptor; critical events evict non-critical records within the serialized queue pipeline.
  2. *Atomic Instance Ownership*: Exclusive lock acquisition with `O_EXCL`, verified PID liveness (`kill(pid, 0)`), in-process active registry, and automatic dead PID stale lock cleanup.
  3. *Privacy-Safe Quarantine*: Corrupted trailing records quarantine metadata and SHA-256 hash only; zero plaintext or base64 secrets emitted by default. Quarantine record fsynced before file truncation.
  4. *Schema-Bound String Truncation*: Truncation reserves suffix space guaranteeing messages strictly `<= 8192` chars and preserving UTF-16 surrogate pairs; empty messages default to `"[empty]"` (`minLength: 1`).
  5. *Max Event Size*: Strict enforcement of `maxEventSizeBytes` (1 MiB default) with observable drop counters and minimal critical fallback.
  6. *Multi-Instance & Isolated Distribution*: Zero monorepo source leakage; clean installation in external isolated consumer.
- **NestJS Logging Adapter Quality Gates (LOGHUB-PKG-003):**
  1. *Automatic HTTP Observability*: Generates `http.request.completed` on real NestJS requests with monotonic durations (`skyra.duration_ms` and `event.duration`), HTTP status codes, and outcome.
  2. *W3C Distributed Tracing*: Parses and validates W3C `traceparent` headers; propagates context via Node.js `AsyncLocalStorage` without cross-request context leakage.
  3. *Route & Body Sanitization*: Parameterizes routes (e.g. `/users/:userId/orders`) and strips query strings/tokens; strictly prohibits logging raw request or response bodies.
  4. *Preserved HTTP Error Semantics*: `SkyraHttpExceptionFilter` captures `HttpException` and uncaught exceptions with sanitized stack traces without altering default client error responses.
  5. *Instrumentation Telemetry*: `measureJob()` and `measureDatabase()` record monotonic execution times without logging raw SQL parameter values or credentials.
  6. *External Consumer Distribution*: Tarball verified in isolated external NestJS application with real HTTP requests and canonical schema validation.
- **Next.js Logging Adapter Quality Gates (LOGHUB-PKG-004):**
  1. *App Router Route Handler Observability*: Generates `http.request.completed` on real Next.js requests without buffering or consuming streaming responses.
  2. *W3C Distributed Tracing & Request ID*: Validates W3C `traceparent` headers, generates safe request IDs, and maintains strict AsyncLocalStorage isolation across concurrent requests.
  3. *Dynamic Route & Unknown-Route Privacy*: Parameterizes dynamic routes (e.g. `/api/users/[userId]`) and forces unknown routes with arbitrary tokens or email addresses to `[unmatched-route]`.
  4. *Server Actions Safety*: Measures execution duration and logs `action.completed` / `action.failed` while strictly forbidding raw function argument and form data serialization.
  5. *Next.js Instrumentation Hooks*: Tested with Next.js `register()` and `onRequestError()` lifecycle hooks with error deduplication.
  6. *Production Build Integration & Isolated Consumer*: Real integration tests against production Next.js build; tarball verified in external isolated consumer application with zero secret leakage.
- **Python Logging SDK Quality Gates (LOGHUB-PKG-005):**
  1. *Native Python Logging Compatibility*: Transparent integration via `SkyraLoggingHandler` mapping standard Python logging levels to canonical levels, handling `exc_info` chains, and preventing recursive handler logging or propagation duplication.
  2. *Single-Writer Process Ownership & Stale Lock Cleanup*: Exclusive `.instance.owner` acquisition with atomic `O_EXCL`, cross-platform PID liveness checks (`kill(pid, 0)`), in-process active registry, and automatic stale lock recovery.
  3. *Daily UTC Midnight Rotation & Size Rollover*: Strict UTC calendar date rotation at midnight without relying on local machine time, 100 MiB monotonic part indexing (`YYYY-MM-DD.part-XXXX.jsonl`), and binary mode (`'wb'`) UTF-8 byte counting preventing Windows CRLF corruptions.
  4. *Bounded Background Queue & Priority Eviction*: FIFO event queue with strict limits on event count and serialized bytes; high-severity `error` and `fatal` events evict lower-severity records under pressure; observable drop counters.
  5. *Privacy-Safe Crash Recovery*: Trailing partial lines detected on restart, quarantined with metadata and SHA-256 hash to `${date}.corrupt.log` (fsynced before truncation), without persisting raw plaintext tokens or credentials.
  6. *Context & Telemetry Instrumentation*: `contextvars` context propagation with strict W3C trace validation; `measure_database` and `measure_job` helpers recording monotonic nanosecond durations without logging raw SQL parameter values or credentials.
  7. *Cross-Language Compatibility & Isolated Verification*: 100% bidirectional JSONL parser compatibility between Node.js and Python; wheel distribution verified in isolated external virtualenv with zero repository-local imports.
- Performance targets are **provisional**, not promises: p95 basic search <3s for pilot representative data; ingestion throughput and resource budgets to be established with agreed log volume.
- Release blocked on critical vulnerability without approved, documented exception.

## 6. CI stages
Format/lint → type check → build → schema fixtures → unit → ephemeral infra integration → security scans → Playwright e2e → package consumer smoke → artifact publication (approval). Use test DB/index namespaces and controlled seed data, never production credentials or customer logs.

## 7. Test evidence template
For each task capture test command, environment/image version, executed count, pass/fail/skip, coverage where measured, log snippets redacted, and defects with links. Tests NOT run must say **not run** and why. `06-PROJECT_MEMORY.md` references actual evidence and commit.

## 8. Release certification
Pilot services, privilege isolation, credential revocation, log rotation, ingestion replay, query load, deployment smoke, offsite backup and restore, performance budget, and documentation acceptance. Apply regression set to Skyra Platform component changes separately.


## File-first and report-first quality gates
- Synthetic fixture generator scales from small representative days to measured larger datasets; no real production/customer personal data. Compare JSONL and Parquet semantic equivalence and reconciliation (counts, event IDs, duration precision).
- Test central archive segment atomicity, UTC rollover, safe project prefixes, duplicates/replay, partial writes, collector recovery, compactor crash/restart, manifest correctness, immutable source retention and backup/restore.
- Benchmark cold versus warm saved report loads, cache invalidation, histogram and p95/p99 aggregation accuracy; evaluate report filters, group-by and date pruning across 1–10 concurrent LogHub users. **Source application traffic/log events may be much larger.**
- Verify no raw diagnostic events in PostgreSQL. Test DuckDB sandbox/no arbitrary files, path traversal, disallowed SQL, cross-project result/cache isolation, token expiry/revocation, Jarvis report writes and stale/partial indicators.
- Search is secondary but must benchmark field discovery, text filters and cursor paging. Tantivy remains conditional on measured query failure, not a mandatory MVP component.
- Provisional goals for discussion only: warm cached report p95 <500ms backend, typical recent report p95 <2s, typical targeted search p95 <3s, all on a defined dataset/hardware; measurements required before commitment.
