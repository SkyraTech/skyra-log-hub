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

## 12. NestJS Logging Adapter Benchmark Baseline (LOGHUB-PKG-003)
Measured on Intel(R) Core(TM) i5-10210U @ 1.60GHz (8 cores), 8 GB RAM, Windows NT 10.0.26300, Node.js v24.21.0.
Workload iterations: 10,000 requests per scenario.

| Scenario | Ops/sec | p50 Latency | p95 Latency | p99 Latency | Submitted | Written | Dropped | Heap Diff (MB) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1. Baseline (No Logging Overhead)** | 2,265,621 | 0.1 µs | 0.3 µs | 1.0 µs | 0 | 0 | 0 | -5.17 MB |
| **2. Request Correlation (Middleware + Context)** | 384,608 | 1.5 µs | 3.6 µs | 13.5 µs | 0 | 0 | 0 | +3.96 MB |
| **3. Basic HTTP Event Build & Nonblocking Enqueue** | 12,035 | 65.1 µs | 136.1 µs | 240.6 µs | 10,000 | 0 | 0 | +8.14 MB |
| **4. Request + Exception Logging (Sanitization)** | 6,696 | 108.7 µs | 250.5 µs | 446.4 µs | 10,000 | 0 | 0 | +11.90 MB |
| **5. End-to-End JSONL File Transport Under Load** | 14,789 | 51.6 µs | 97.1 µs | 156.2 µs | 10,000 | 10,000 | 0 | +28.48 MB |

- **Key Observations:**
  - Request correlation using Node.js `AsyncLocalStorage` adds only ~1.5 µs p50 overhead per request, operating at over 384k ops/sec.
  - Asynchronous background JSONL file logging processes ~14.8k ops/sec with a p50 latency of 51.6 µs, ensuring minimal impact on client response times.
  - Deep sensitive data and route sanitization during exceptions operates at ~6.7k ops/sec while preventing sensitive credentials, tokens, or internal stack traces from leaking to clients or storage.

### Next.js App Router Integration Benchmarks (@skyra/logger-next)
Tested with 10,000 iterations per scenario on Node.js v24.21.0, Intel Core i5-10210U (8 cores), Next.js v15.5.28:

| Scenario | Ops/sec | Mean Latency | p50 Latency | p95 Latency | p99 Latency | Submitted | Written | Dropped | Flush (ms) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1. Baseline Route Handler (Uninstrumented)** | 22,835 | 23.0 µs | 16.0 µs | 41.2 µs | 111.6 µs | 0 | 0 | 0 | 0.0 ms |
| **2. Correlation-Only (ALS + W3C)** | 19,648 | 34.5 µs | 23.1 µs | 48.2 µs | 175.1 µs | 0 | 0 | 0 | 0.0 ms |
| **3. withSkyraLogging (JSONL File Transport)** | 1,481 | 602.8 µs | 503.2 µs | 1,205.7 µs | 2,773.7 µs | 10,000 | 10,000 | 0 | 7.7 ms |
| **4. Error-Logging (Exception Serialization)** | 561 | 1,733.9 µs | 1,610.2 µs | 2,521.7 µs | 5,796.0 µs | 10,000 | 10,000 | 0 | 0.2 ms |
| **5. High-Concurrency Burst (50 Concurrent Burst)** | 6,899 | 6,296.5 µs | 5,920.4 µs | 9,790.3 µs | 13,303.7 µs | 10,000 | 10,000 | 0 | 220.9 ms |
| **6. withSkyraLogging (Stdout Transport)** | 2,656 | 355.7 µs | 294.5 µs | 669.7 µs | 1,138.3 µs | 10,000 | 10,000 | 0 | 0.2 ms |

- **Key Observations (@skyra/logger-next):**
  - Next.js AsyncLocalStorage correlation and W3C traceparent extraction add only ~7.1 µs p50 overhead over uninstrumented baseline.
  - End-to-end Route Handler logging with JSONL file transport achieves 1,481 ops/sec with a p50 latency of 503 µs and 100% write completion with 0 event drops.
  - Non-blocking stdout transport (serverless profile) achieves 2,656 ops/sec with a p50 latency of 294 µs.
  - Zero buffering or body consumption: streaming response bodies pass directly through to client.

### Python Logging SDK Benchmarks (skyra-logger / LOGHUB-PKG-005)
Tested on Python 3.12.7 (Windows 11 AMD64, Intel Core i5-10210U @ 1.60GHz, 8 logical processors, 16 GB RAM, NVMe SSD):

| Scenario | Workload | Ops/sec | Mean Latency | p50 Latency | p95 Latency | p99 Latency | Submitted | Written | Dropped |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1. Small Info Event (Stdout)** | 10,000 events | 636.5 | 1.57 ms | 1.43 ms | 2.49 ms | 2.99 ms | 10,000 | 10,000 | 0 |
| **2. Typical Structured Event (File)** | 10,000 events | 426.3 | 2.35 ms | 2.09 ms | 3.67 ms | 4.44 ms | 10,000 | 10,000 | 0 |
| **3. Errors with Fsync** | 1,000 events | 345.5 | 2.89 ms | 1.91 ms | 3.38 ms | 3.80 ms | 1,000 | 1,000 | 0 |
| **4. Deep Redaction Engine** | 10,000 items | 10,796.7 | 92.6 µs | 78.0 µs | 147.0 µs | 171.0 µs | 10,000 | 10,000 | 0 |
| **5. Draft 2020-12 Validation** | 10,000 items | 1,284.9 | 778.2 µs | 675.5 µs | 1.28 ms | 1.65 ms | 10,000 | 10,000 | 0 |
| **6. Multithreaded Burst (8 Threads)** | 10,000 events | 513.1 | 15.22 ms | 14.61 ms | 25.10 ms | 30.84 ms | 10,000 | 10,000 | 0 |
| **7. Queue Saturation & Eviction** | 10,000 events | 1,776.4 | 563.0 µs | 518.0 µs | 948.1 µs | 1.20 ms | 10,000 | 3,227 | 6,773 |

- **Key Observations (skyra-logger):**
  - High-performance redaction engine operates at >10,700 ops/sec with p50 of 78 µs, sanitizing nested dictionaries, lists, and exception chains without mutating input arguments.
  - Queue memory is bounded at <=64 KiB under burst saturation; non-critical events are cleanly evicted to preserve admission for critical `error` and `fatal` events.
  - Zero line interleaving or segment corruption across concurrent writer threads; file ownership guarantees single-process access.
  - Flush latency is deterministic with explicit OS fsync support for durable error persistence.



