# Query Resource Governance & Multi-Tenant Scheduling

**Document Version:** 1.0.0  
**Status:** Approved Architecture Specification  
**Task Reference:** LOGHUB-QUERY-001  
**Applies To:** Query Service Foundation (`apps/query-service`)

---

## 1. Governance Objectives

In an analytical logging platform, unbounded user queries (e.g. `SELECT * FROM logs WHERE message LIKE '%timeout%'` over 2 years) can easily saturate CPU, exhaust RAM, and starve other tenants.

The Query Service enforces multi-layered resource governance:
1. **Prevent Resource Starvation:** Protect ingestion and control plane processes from query load.
2. **Fair-Share Tenant Scheduling:** Ensure that no single tenant monopolizes analytical workers.
3. **Hard Budget Enforcement:** Reject or terminate queries that exceed configured compute, memory, or I/O thresholds.
4. **Graceful Degradation:** Return controlled RFC 7807 problem details instead of process crashes or unhandled timeouts.

---

## 2. Resource Budgets & Guardrails

| Dimension | Default Budget | Hard Ceiling | Enforcement Mechanism | Failure Response |
| :--- | :--- | :--- | :--- | :--- |
| **Max Time Range** | 7 days | 30 days | API Request Validation (JSON Schema + Preflight) | `400 Bad Request` (`TIME_RANGE_TOO_LARGE`) |
| **Max Page Size** | 50 items | 500 items | API Request Validation | `400 Bad Request` (`INVALID_ARGUMENT`) |
| **Max Segments per Query** | 500 segments | 2,000 segments | Query Planner Pruning Check | `400 Bad Request` (`QUERY_TOO_BROAD`) |
| **Max Scanned Bytes** | 5 GB | 20 GB | DuckDB File Scan Estimator | `400 Bad Request` (`SCAN_BUDGET_EXCEEDED`) |
| **Max Memory per Query** | 256 MB | 1 GB | DuckDB `SET max_memory = '256MB'` | `429 Too Many Requests` (`RESOURCE_EXHAUSTED`) |
| **Max Query Duration** | 10 seconds | 30 seconds | Async Task AbortController + DuckDB Interrupt | `504 Gateway Timeout` (`QUERY_TIMEOUT`) |
| **Max Concurrent Queries (System)** | 8 queries | 16 queries | Worker Execution Semaphore | Queue up to Max Queue Depth |
| **Max Queue Depth (System)** | 32 queries | 64 queries | In-Memory Request Queue | `429 Too Many Requests` (`QUEUE_FULL`) |
| **Max Concurrent Queries per Tenant** | 2 queries | 4 queries | Per-Tenant Fair Token Bucket | Queue or reject tenant request |

---

## 3. Concurrency Architecture & Fair Scheduling

### 3.1 Two-Tier Queue & Worker Pool

```text
Incoming Query Requests (Fastify Router)
                 │
                 ▼
     [ Tenant Rate Limiter ] ─── Reject if tenant queue depth > 8
                 │
                 ▼
       [ Priority Fair Queue ]
       ├── Tenant A (Active: 1, Queued: 1)
       ├── Tenant B (Active: 0, Queued: 2)
       └── Tenant C (Active: 2, Queued: 0)
                 │
                 ▼
     [ Query Execution Semaphore (Max: 8) ]
                 │
                 ▼
   ┌─────────────┼─────────────┐
   ▼             ▼             ▼
Worker 1      Worker 2      Worker N
(DuckDB)      (DuckDB)      (DuckDB)
```

1. **Fair Queuing:** The scheduler uses Deficit Round-Robin (DRR) across active tenant queues so that a tenant bursting 20 queries cannot block another tenant with 1 query.
2. **Worker Pool:** Queries run in dedicated worker threads or pooled DuckDB connection instances.
3. **Execution Isolation:** Each worker maintains an isolated in-memory DuckDB connection, preventing connection pollution or cross-query state leakage.

---

## 4. Query Cancellation & Timeout Handling

### 4.1 Abort Signal Propagation
1. **Client Disconnection:** If the client closes the HTTP connection before the query completes, Fastify fires a request abort event.
2. **Timeout Expiry:** If the query execution exceeds `max_query_duration_ms`, a Node.js `setTimeout` triggers an abort.
3. **DuckDB Interrupt:** The worker calls DuckDB's native interrupt API (`connection.interrupt()`), halting active vector scanning immediately and releasing worker memory back to the pool.
4. **Cleanup:** Temporary spill files in `/tmp/skyra-query-spill/` are deleted upon query completion or cancellation.

### 4.2 Implementation & Verification (LOGHUB-QUERY-003)
In LOGHUB-QUERY-003, `QueryResourceGovernorService` was implemented in `src/modules/query-execution/infrastructure/duckdb/`:
- **Concurrency Ceilings:** 4 concurrent active execution slots.
- **Queue Depth:** Bounded in-memory queue of 16 pending tasks (overflow rejects with `QueryBudgetExceededException`).
- **Tenant Fairness:** Max 2 active slots per tenant; when slots free up, waiting tasks from under-represented tenants are dispatched ahead of saturated tenants.
- **True Cancellation Verification:** Integration tests (`duckdb-execution.test.ts` DDB-8 and DDB-9) verified that `conn.interrupt()` terminates DuckDB query loops cleanly when `AbortSignal` fires or execution exceeds the timeout limit.

### 4.3 Search API Resource Controls (LOGHUB-QUERY-004)
In LOGHUB-QUERY-004, additional resource governance controls were added across the HTTP API layer:
- **Bounded Pagination Limits:** Default limit 50, ceiling 500 items per request, enforced by `SearchValidationPipe`.
- **Lookahead Result Materialization:** The SQL engine requests exactly `limit + 1` rows (`fetchExtraRow: true`), determining `has_more` without running expensive second count queries or scanning entire segments.
- **Input Bounding:** Structured filters are capped at 15 filters maximum, filter arrays capped at 100 items, and string lengths capped at 512 characters.
- **Pre-Read Catalog Boundary:** Segments are resolved and filtered via PostgreSQL catalog indexes *before* DuckDB is invoked, guaranteeing only matching finalized segments are scanned.

---

## 5. OS-Level Process & Cgroup Isolation

In production deployments:
- The Query Service runs as an independent process/container (`skyra-query-service`) distinct from the Ingestion Gateway (`skyra-ingestion-gateway`).
- **Resource Constraints (Docker / systemd):**
  - CPU: Constrained to specific cores (e.g. `CPUShares=1024`, `CPUQuota=400%`).
  - Memory: Hard limit with cgroup OOM killer isolated to query workers (`MemoryMax=4G`).
- **Filesystem Permissions:** The Query Service process runs under an unprivileged user (`skyra-query`) with **read-only** permissions to the archive directory (`/var/loghub/archive/` and `/var/loghub/derived-parquet/`), and read-write permissions strictly limited to its scratch directory (`/tmp/skyra-query-spill/`).
