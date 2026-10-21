# Skyra Logging Standard v1.0 — Draft

> **Product:** Skyra LogHub  |  **Status:** Proposed baseline — review before implementation  |  **Version:** 0.1-draft  |  **Date:** 2026-10-21
> **Repository:** `skyra-loghub` (renamed by project owner). Assumptions and undecided items are marked **TBD**. These documents are design specifications, not assertions that code already exists.

## 1. Scope and philosophy
One language-neutral **canonical canonical JSONL event** for events emitted from Node.js, NestJS, Next.js, Python and browser adapters. Inspired by user's previous Serilog JSONL practice, but improves security, naming and duplicate-key correctness. Indexed shape aligns with Elastic Common Schema (ECS) where applicable; Skyra extensions live under `skyra.*`. Source adapters can emit their own internal representations only if the ingestion normalizer produces canonical schema without losing trace/identity attributes.

## 2. Envelope and core fields
| Field | Type | Requirement | Semantics |
|---|---|---|---|
| `@timestamp` | RFC3339 UTC string | Required | Event generation time (not ingest time) |
| `event.id` | UUID string | Required | Unique per event, stable on retries |
| `log.level` | keyword | Required | `trace`, `debug`, `info`, `warn`, `error`, `fatal`; normalized mapping |
| `message` | string | Required | Sanitized, bounded human-readable text |
| `service.name` | keyword | Required | Registered service identifier |
| `service.environment` | keyword | Required | `local`, `dev`, `qa`, `staging`, `production` or registered env |
| `skyra.project_id` | keyword | Required | Immutable authorized project ID |
| `skyra.schema_version` | keyword | Required | e.g. `1.0` |
| `event.action` | keyword | Required | E.g. `http.request.completed` |
| `event.outcome` | keyword | Contextual | `success`, `failure`, `unknown` |
| `event.category` | keyword array | Contextual | ECS event categories; validate mapping |
| `trace.id` | 32 hex chars | If traced | W3C trace identifier |
| `span.id` | 16 hex chars | If traced | Span identifier |
| `service.version` | keyword | Recommended | Release build identifier |
| `host.name` | keyword | Runtime dependent | Host identity, never user-supplied routing key |
| `error.type` / `error.message` | string | Error events | Sanitized exception class / text |
| `event.duration` | nonnegative integer | Duration events | **Nanoseconds** (ECS) |
| `skyra.duration_ms` | finite number | Optional | Human-readable display measurement |

## 3. Event taxonomy
| Class | `event.action` example | Suggested fields |
|---|---|---|
| HTTP | `http.request.completed` | `http.request.method`, `http.response.status_code`, `url.path` (normalized safe path), `skyra.http.route_template`, `event.duration`, `http.request.id` |
| Slow API | `http.request.slow` | threshold and route template; not necessarily a second full request event |
| Database | `db.query.slow` | `db.system`, `db.operation.name`, `db.collection.name`, `skyra.db.query_fingerprint`, `skyra.db.client_duration_ms` |
| Dependency | `dependency.call.completed` | remote service alias, status, attempt number, duration |
| Job | `job.completed` | `skyra.job.id`, `skyra.job.type`, `skyra.job.status`, queue time, duration |
| Security | `authentication.failed`, `authorization.denied`, `token.revoked` | actor pseudonymous ID, scope, decision, outcome; no tokens |
| Audit | `entity.updated` | entity type, actor ID, safe changed-field names, counts; avoid raw old/new PII |
| Business | `business.operation.completed` | approved business action and bounded numeric measures |
| Runtime | `runtime.resource.warning` | CPU/memory/disk diagnostic metrics, rate bounded |
| MCP | `mcp.tool.executed` | tool name, caller, duration, decision, result count—not tool content |

## 4. API and database timing
- Duration values are measured using monotonic clocks where feasible; wall timestamp is separately UTC.
- `event.duration` is nanoseconds; never mix milliseconds in that field. Convert reliably and test.
- Report total request duration; optionally DB query count, summed **client-observed** query durations and slowest fingerprint; avoid falsely equating aggregate database timing with exclusive API time (parallel calls overlap).
- DB client duration includes driver/ORM/network/connection overhead; DB server execution timing requires separate telemetry.
- Slow thresholds are per service/operation and environment; emitting each DB query in production is opt-in with sampling/cost controls.
- Do not store raw bind parameters, connection strings, raw query text by default; use approved normalization/fingerprinting for grouping.

## 5. Canonical valid example
```json
{
  "@timestamp": "2026-10-21T11:20:35.123Z",
  "event": {
    "id": "9eb0da91-1210-493a-b2e4-e03cab03edb9",
    "action": "http.request.completed",
    "outcome": "success",
    "category": ["web"],
    "duration": 245000000
  },
  "log": {"level": "info"},
  "message": "GET /api/projects completed",
  "service": {"name": "skyra-erp-api", "environment": "production", "version": "1.0.0"},
  "trace": {"id": "4bf92f3577b34da6a3ce929d0e0e4736"},
  "http": {"request": {"method": "GET"}, "response": {"status_code": 200}},
  "skyra": {
    "project_id": "skyra-erp",
    "schema_version": "1.0",
    "component": "api",
    "http": {"route_template": "/api/projects"},
    "duration_ms": 245.0
  }
}
```
Sample uses fictional identifiers and demonstrates schema shape, not actual production output. Validate ECS field definitions against the pinned release before generating code.

## 6. Serialization requirements
- One compact valid JSON object per physical line, UTF-8, line-ending `\n`; no multiline pretty printing.
- Strict parser rejects duplicate property names at any depth, including collision after normalization; unlike the legacy Serilog screenshot, do not repeat template and enriched keys.
- Arrays of tags bounded and sanitized; prohibit unlimited user-controlled dynamic field keys (mapping explosions).
- Null vs omitted rules defined in JSON Schema; no NaN, Infinity, cyclic graphs, dates as local time or unbounded exception serialization.
- `messageTemplate` may be recorded as `skyra.message_template` where safe and bounded; keep only one canonical property for each attribute.

## 7. Privacy and security
Never log raw passwords, access/refresh tokens, API keys, cookies, authorization headers, secret URLs, full payment data, personal patient data, unapproved personal identifiers, arbitrary request/response bodies, raw SQL parameter values, AI prompts or retrieved confidential documents. Redact at SDK and ingest; default deny high-risk fields, allowlist business telemetry; do not trust regex-only removal. Treat stack traces as restricted, rotate/download only with authorized access.

## 8. Files and retention
```text
${LOG_ROOT}/${PROJECT_ID}/${ENV}/${SERVICE}/${INSTANCE}/2026-10-21.jsonl
${LOG_ROOT}/${PROJECT_ID}/${ENV}/${SERVICE}/${INSTANCE}/2026-10-21.001.jsonl
```
- UTC daily cutoff and size rollover (starting proposal **100 MiB**, configurable). Local retention starting suggestion **7 days**; centralized retention proposal **30 days application**, **90 days security audit** only after compliance/storage review. Previous organization used 90 days locally; **not adopted automatically**.
- Storage quota/disk reserve, permissions e.g. directory owner-only, restricted file readers, safe symlink handling; no path traversal.
- Avoid shared-file concurrent writes across replicas; unique instance ID. Serverless stdout path may supersede files.

## 9. Identity and routing protection
Never accept `skyra.project_id` solely from the body for authorization. Verify registered service credential/collector identity ↔ allowed project/service; enrich trusted origin; reject mismatches. Use event ID for replay dedupe when warranted.

## 10. Sampling, cardinality and operations
Count API requests/errors via unsampled counters; use configurable tracing/log sampling for routine high-volume details. Bound attribute lengths, tag counts, query identifiers and numeric precision. Track dropped records, buffer occupancy, collector lag, archive write/conversion/query failure counts and queue backlog as separate operational telemetry.

## 11. Compatibility/testing
Schema and samples live under versioned canonical contracts. For each SDK run fixture parity, clock/timezone, duplicate-property rejection, unknown field, redaction, rotation, crash recovery, concurrency and cross-language compatibility tests. Breaking field/type changes require a schema major version and ADR.

## 12. Implemented artifacts (LOGHUB-PKG-001, PKG-001B & PKG-001C)
The following canonical artifacts and foundation packages are implemented, verified, hardened, and certified:
- Canonical JSON Schema v1.0.0 (Draft 2020-12): `contracts/schemas/v1/log-event.schema.json` (pinned ECS `8.11.0` via `const: "8.11.0"`, isolated from `skyra.schema_version` `1.0.0`; strict RFC 4122 UUIDv4 on `event.id`; bounded UTC RFC3339 timestamps with calendar leap year validation; strict unknown property rejection).
- Storage Contract Specification: `contracts/storage-contract.md` (mandatory single-writer instance isolation, UTC daily segments, 100 MiB rollover, partial-line quarantine recovery).
- Conformance & Error Fixtures: `contracts/fixtures/v1/` (6 valid fixtures and 5 invalid fixtures tested across TS Ajv 2020 and Python jsonschema 2020-12).
- Schema Synchronization Tooling: `scripts/sync-schemas.mjs` (`pnpm run sync:schemas`, `pnpm run check:schema-sync`) ensuring zero drift between canonical schema and package embedded definitions.
- TypeScript Core (`@skyra/logger-core`): compiled `dist/` artifacts (`.js` and `.d.ts`), JIT-cached Ajv 2020 validator, circular-safe compound-key redaction engine, immutable `normalizeLogEvent`, calendar timestamp validation, and duplicate-key parser. Tarball verified in clean Node and TS consumers.
- Python Core (`skyra-logger`): PEP 621 package with `jsonschema` Draft 2020-12 validator, circular-safe compound-key redaction, immutable `normalize_log_event`, calendar timestamp validation, and duplicate-key parser. Wheel and sdist verified in clean consumer.
- Automated Contract Tests: `tests/contracts/schema-validation.test.ts` (13 suites passing) and `packages/logger-python/tests/test_schema.py` (14 tests passing) — total 27 passing tests with zero regressions.


## Storage-independent canonical log delivery
- ECS-inspired property names and Skyra extension names are adopted as a **portable JSON event schema**; Elasticsearch itself is not a dependency or required destination. Publish a language-neutral JSON Schema with strict duplicate-key, timestamp, range and max-size test fixtures.
- Application SDKs emit per-project/environment/service/instance **UTC daily JSONL** locally only if persistent host storage is suitable; local spool is temporary. Production source-of-truth archive is centrally finalized immutable JSONL segments; optional size rollover and archive checkpoints.
- The compaction job writes partitioned Parquet **derived data** and can reprocess from source segments, without introducing a raw-log PostgreSQL table. Include `event.id`, safely normalized dimensions, typed durations and safe query fingerprints in converted columns for report speed.
- Schema changes require compatibility validation of JSONL input and Parquet conversion, versioned normalizers and representative cross-language fixtures.
- Archive and derived-data retention separate; define audit event preservation independently from routine diagnostics. Monitoring measures ingestion lag, segment close/finalize, compaction lag, query worker use, report cache freshness and disk/object storage health.
