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
