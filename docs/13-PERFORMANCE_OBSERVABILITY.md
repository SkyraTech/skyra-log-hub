# Performance, Metrics and Tracing Specification

> **Product:** Skyra LogHub  |  **Status:** Proposed baseline — review before implementation  |  **Version:** 0.1-draft  |  **Date:** 2026-10-21
> **Repository:** `skyra-loghub` (renamed by project owner). Assumptions and undecided items are marked **TBD**. These documents are design specifications, not assertions that code already exists.

## 1. Objectives
Expose **where time is spent**, not merely whether logs exist. Monitor API and DB client timing, external dependencies, jobs, cache, queues, frontend and runtime resources. Logs, metrics and traces are complementary and must not be conflated.

## 2. Measurement boundaries
- HTTP server latency = start of accepted request to response completion; exclude time before proxy unless gateway provides it.
- DB client query latency = ORM/driver observation including network and overhead; not necessarily database-engine execution time.
- External calls = outbound client duration incl. retries as separate attempts and total call.
- Job latency = queue wait and execution separately; retry attempts linked to parent job.
- Use high-resolution monotonic timers; emit UTC wall time; `event.duration` nanoseconds.
- Parallel spans overlap: summed durations may exceed top-level request latency.

## 3. Instrumentation plan
| Signal | Recommended collection | Key dimensions |
|---|---|---|
| HTTP duration/count/errors | NestJS/Node/OpenTelemetry instrumentation | route template, service, environment, status family |
| DB duration/slow fingerprints | Prisma/TypeORM/SQLAlchemy supported hooks | DB system, normalized operation/fingerprint |
| External API | HTTP clients and OTel spans | known dependency, outcome, attempt |
| Cache | Valkey/Redis client instrumentation | operation, result hit/miss, service |
| Background tasks | worker/job hooks | queue, job type, outcome, attempt |
| Runtime | collector/exporter | CPU, memory, disk, event loop/GC where supported |
| Frontend | Web Vitals/browser telemetry | route template, browser class, outcome; sampled |
| MCP/AI tools | MCP server/interceptors | tool, duration, outcome, token use metrics sans payload |

## 4. Dashboard calculations
- API RPS, 4xx/5xx rate, p50/p95/p99 request latency, worst endpoints by normalized route.
- DB query counts, slow query distribution, p95 time by fingerprint, DB connection pool wait vs execution if instrumented.
- Dependency failure rate, retry counts, timeouts, circuit breaker opens.
- Job failures, retry rate, wait time, processing duration; queue backlog.
- Infrastructure utilization and ingestion health/dropped records.
- Deploy annotation by version to compare before/after release.

## 5. Initial slow thresholds (illustrative only)
| Operation | Draft warning threshold | Note |
|---|---:|---|
| Common interactive API | 1000 ms | Must be overrideable per route |
| Database client operation | 500 ms | Client time not DB server time |
| External dependency | 2000 ms | Depends on service contract |
| Background job | service-specific | SLA dependent |
Log slow operations as structured warnings; collect unsampled metrics for count/latency aggregation and sample trace detail based on budget. Avoid high-cardinality metric labels such as raw user email or record ID.

## 6. Trace propagation
Adopt W3C Trace Context (`traceparent`) and OTel context propagation across HTTP, background queue, internal service and MCP boundaries. Keep baggage allowlisted and privacy-reviewed. `trace.id` and `span.id` in logs; full spans require separate trace ingest/storage schema, retention and UI rollout.

## 7. SQL privacy and performance
Store operation `SELECT`, system `postgresql`, approved table alias and safe fingerprint; raw parameterized SQL text and bind values off by default. Ensure no credentials/PII in exception messages; cap statement field sizes. Query count and sum of client durations are useful but may overlap; explicitly label measurement semantics in UI.

## 8. Alerting policy
Draft alerts: sustained API p95 above per-endpoint budget, elevated 5xx ratio, abnormal DB timeouts/slow fingerprints, job failure/backlog, ingestion drops, ES disk high watermark, token abuse. Use minimum sample counts, windows, cooldown, grouping, severity and recovery notifications to reduce noise.

## 9. Validation tests
Synthetic timed HTTP/DB calls with tolerance assertions, monotonic-clock conversion, propagation through multiple services, redaction of SQL parameters, percentile correctness for known fixture, sampled trace effect on completeness and error budget, dashboards with late-arriving events/timezone conversion, load-based overhead budget.

## 10. Decision pending
Dedicated traces/metrics storage approach and sampling policy; initial SDK emits correlated logs plus metrics hooks, with full waterfall UI deferred until evidence-backed plan.


## Performance-report acceleration policy
- Standardize typed `event.duration` (nanoseconds) and explicit Skyra `*_duration_ms` measures for API, query, job and external dependency latencies. Normalized low-cardinality dimensions include project, service, environment, method, route template, status band and DB query fingerprint.
- JSONL events are archived centrally; Parquet conversion selects typed analytical columns and preserves allowable extra attributes. Partition prune by project/service/day and avoid tiny files.
- Dashboard report P0: count/error rate, throughput, slow operations, average and p50/p95/p99 timings, date histogram, group-by, breakdowns and compare with prior period. Cached/precomputed report outputs must expose freshness and measurement interval.
- Query worker uses DuckDB with defined concurrency, memory/time budgets; tests distinguish cold Parquet scans from warm cached loads. Exact percentile definition and missing-value policy documented/tested.
- No raw SQL parameters or confidential HTTP/AI payloads; client-observed DB latency is not database-server execution time.

## 11. Node.js Logging SDK Benchmark Baseline (LOGHUB-PKG-002 & PKG-002A)
Measured on Intel(R) Core(TM) i5-10210U @ 1.60GHz (8 cores), 8 GB RAM, Windows NT 10.0.26300, Node.js v24.21.0.
Hardened measurement standard enforces separate tracking of submitted, accepted, written, dropped, and fsynced events. Effective throughput is calculated strictly as `eventsWritten / totalDurationSec`:

| Scenario | Submitted | Accepted | Written | Dropped | Fsynced | Duration | Effective Throughput | p50 Enqueue | p95 Enqueue | p99 Enqueue | Disk Throughput | Drain Latency |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Small Info Events** | 10,000 | 10,000 | 10,000 | 0 | 1 | 1,387 ms | **7,209 ops/sec** | 90.2 µs | 210.5 µs | 672.7 µs | 2.72 MB/s | 288 ms |
| **Typical Structured Events** | 10,000 | 10,000 | 10,000 | 0 | 1 | 3,401 ms | **2,940 ops/sec** | 228.3 µs | 562.8 µs | 1,670 µs | 2.23 MB/s | 483 ms |
| **Errors + Stack Traces + Fsync** | 5,000 | 5,000 | 5,000 | 0 | 5,001 | 9,222 ms | **542 ops/sec** | 213.0 µs | 599.5 µs | 1,658 µs | 0.47 MB/s | 7,633 ms |
| **High-Burst Logging (20k burst)** | 20,000 | 10,000 | 10,000 | 10,000 | 1 | 3,054 ms | **3,274 ops/sec** | 120.6 µs | 265.8 µs | 614.2 µs | 1.31 MB/s | 291 ms |

- **Component Overhead Breakdown (per 10k iterations):**
  - Canonical Event Build + UUIDv4: 113.88 µs/op
  - JSONL Serialization (`JSON.stringify` + single line newline): 6.82 µs/op
  - Deep Sensitive Data Redaction: 27.13 µs/op
  - Ajv 2020 Schema Validation: 17.23 µs/op
- **Hardened Invariants:** Bounded in-memory write queue strictly enforces memory bounds (default 64 MiB, 10k items). Queue saturation drops non-critical events while critical events (`error`, `fatal`) prioritize via queue eviction within the single-writer pipeline, completely avoiding out-of-band concurrent writes. Hard disk errors trigger `onError` without crashing the host process. Plaintext secrets are never stored in quarantine recovery files.
