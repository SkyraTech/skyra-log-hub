# DuckDB & Derived Parquet Analytical Storage Design

**Document Version:** 1.0.0  
**Status:** Approved Architecture Specification  
**Task Reference:** LOGHUB-QUERY-001  
**Applies To:** Query Service Foundation & Analytical Storage (`apps/query-service`)

---

## 1. Core Architectural Invariant

**The immutable JSONL archive remains the sole authoritative source of truth for log events.**

- DuckDB is an embedded, vectorized analytical SQL engine used for read acceleration.
- Parquet is a derived, reproducible columnar representation generated from finalized JSONL segments.
- The platform never modifies, replaces, or deletes JSONL segments when creating or deleting Parquet files.
- Loss, corruption, or schema changes of Parquet files require no data recovery procedures beyond re-running conversion from canonical JSONL.

---

## 2. DuckDB Runtime & Node.js Integration

### 2.1 Package Selection & Validation Spike Results

As established in the LOGHUB-QUERY-001 feasibility spike:
- The legacy `duckdb` package (v1.1.x / v1.4.x) relies on `node-pre-gyp` with C++ build scripts that fail in strict package managers (pnpm v12+) and lack prebuilt binaries for modern Node.js versions (Node 24+, ABI 137).
- The official next-generation package `@duckdb/node-api` (v2.0.0-r.1) utilizes modern Node-API (N-API) and platform-specific prebuilt binaries (`@duckdb/node-bindings-win32-x64`, `@duckdb/node-bindings-linux-x64-gnu`, etc.).
- The feasibility experiment validated that `@duckdb/node-api` installs cleanly without build scripts, instantiates in-memory DuckDB instances, reads JSONL via `read_json_auto`, executes parameterized SQL filters, and executes grouped aggregations with zero native compilation overhead.

### 2.2 Instance Lifecycle & In-Memory Operation

The Query Service initializes DuckDB in **in-memory mode** (`:memory:`):
1. **Stateless Query Execution:** Each query worker or pool connection operates on an in-memory DuckDB instance.
2. **Ephemeral Tables:** Files are scanned directly via `read_json_auto([...])` or `read_parquet([...])` table functions.
3. **Memory Ceilings:** Instance-level memory limits are enforced via `SET max_memory = '256MB'` upon connection creation.
4. **Temporary Spilling:** If intermediate sort or aggregation operations exceed memory budgets, DuckDB spills to a dedicated, process-restricted temporary directory (`/tmp/skyra-query-spill`), which is purged upon query termination.

---

## 3. Direct JSONL Scanning Strategy

### 3.1 Function Invocation & Verified Implementation (LOGHUB-QUERY-003)

In task LOGHUB-QUERY-003, comprehensive integration testing revealed that using `read_json_auto` without explicit table binding can trigger `Binder Error: Referenced table "error" not found!` when querying optional ECS object hierarchies (such as `error` or `http`) across segments where those objects are completely absent.

To provide robust, zero-binder-error querying across all valid ECS canonical variations, the Query Service implements `read_ndjson_objects([$1, $2, ...])` combined with `json_extract_string`:

```sql
SELECT 
  json_extract_string(json, '$."@timestamp"') AS "@timestamp",
  json_extract_string(json, '$.event.id') AS "event.id",
  json
FROM read_ndjson_objects([$1, $2, ...])
WHERE json_extract_string(json, '$.skyra.tenant_id') = $P_tenant
  AND json_extract_string(json, '$.skyra.project_id') IN ($P_projects)
  AND json_extract_string(json, '$."@timestamp"') >= $P_start
  AND json_extract_string(json, '$."@timestamp"') < $P_end
  -- Filter AST predicates
ORDER BY json_extract_string(json, '$."@timestamp"') DESC, json_extract_string(json, '$.event.id') DESC
LIMIT $P_limit;
```

### 3.2 Security & Parity Advantages
1. **Zero Binder Errors on Optional Fields:** Missing optional objects (`error`, `http`, `user`, `labels`) evaluate cleanly to `NULL` rather than aborting query execution with DuckDB schema binder errors.
2. **Byte-for-Byte Canonical Preservation:** The `json` column retains the exact original ingested and archived JSON string, ensuring zero timestamp drift or timezone conversion anomalies.
3. **Double Defense-in-Depth:** In addition to strict pre-query segment authorization via `ArchiveDiscoveryService`, row-level predicates enforce `tenant_id` and `project_id` matching directly inside DuckDB.
4. **Deterministic Tie-Breaker Ordering:** The composite sorting `(@timestamp DESC, event.id DESC)` ensures stable pagination ordering for task QUERY-004.

---

## 4. Derived Parquet Storage Architecture

### 4.1 Storage Layout & Hive Partitioning

Parquet files reside in a dedicated derived directory structure mirroring the canonical archive hierarchy:

```text
/var/loghub/derived-parquet/
  └── tenant=<tenant-id>/
      └── project=<project-id>/
          └── environment=<environment>/
              └── date=YYYY-MM-DD/
                  ├── segment-0192e4a8-6b8c-7f2e-a5e1-8f9d0c2e3a4b.parquet
                  ├── segment-0192e4a8-6b8c-7f2e-a5e1-8f9d0c2e3a4b.parquet.sha256
                  └── segment-0192e4a8-6b8c-7f2e-a5e1-8f9d0c2e3a4b.meta.json
```

### 4.2 Parquet File Specification
- **Format:** Apache Parquet version 2.6.
- **Compression Codec:** `zstd` (compression level 3), providing a 6:1 compression ratio on structured JSON logs with high decompression throughput (>1 GB/s per core).
- **Row Group Size:** 64 MB or 100,000 rows (whichever is smaller). Enables efficient column pruning and dictionary-filtered skips.
- **Data Page Size:** 1 MB.
- **Dictionary Encoding:** Enabled for low-cardinality string columns (`log.level`, `service.name`, `environment`, `event.action`, `http.response.status_code`).
- **Statistics:** Min/max statistics recorded for `@timestamp`, `event.id`, and trace identifiers to support page-level dictionary skipping.

---

## 5. Parquet Conversion Lifecycle

### 5.1 Conversion Workflow

```text
1. Segment Finalized in JSONL Archive (Phase 2 Ingestion)
   │
   ▼
2. Segment Recorded in PostgreSQL `archive_segments` (state: CLOSED, checksum verified)
   │
   ▼
3. Background Worker Claims Conversion Job (Advisory Lock)
   │
   ▼
4. DuckDB Converts JSONL Segment -> Temporary Parquet (`.tmp-conv-...`)
   │
   ▼
5. Worker Computes SHA-256 of Generated Parquet
   │
   ▼
6. Parquet Parity Verification: Worker compares row count and event ID checksum
   │
   ▼
7. Atomic Rename: `.tmp-conv` -> `segment-<id>.parquet`
   │
   ▼
8. Update PostgreSQL Catalog (`parquet_segments` table / metadata status)
```

### 5.2 Failure & Recovery Invariants
- **Atomic Publication:** Temporary Parquet files are written to `.tmp-conv-<uuid>` and moved into the partition tree via POSIX `rename()` only after checksum and row-count verification. Incomplete conversions are never visible to queries.
- **Zero Ingestion Impact:** Parquet conversion workers run as low-priority background processes with nice/cgroup I/O caps. Ingestion WAL and JSONL archival never wait for Parquet generation.
- **Complete Rebuildability:** An administrative command `skyra-admin rebuild-parquet --tenant <id> --date <range>` can rebuild the entire Parquet storage from canonical JSONL without system downtime.

---

## 6. Query Engine Hybrid Execution (Verified in LOGHUB-QUERY-006)

When serving queries across a time range:
1. **Catalog Inspection:** The `HybridSourcePlannerService` inspects the derived catalog (`IParquetCatalogPort`) for each discovered canonical segment.
2. **Deterministic Source Selection:**
   - If Parquet exists, has status `VERIFIED`, matches file size on disk, and has an identical `sourceChecksum` $\rightarrow$ Routed to `parquetDescriptors`.
   - If Parquet is missing, invalid, corrupt, or checksum-drifted $\rightarrow$ Automatically and transparently falls back to canonical JSONL in `canonicalDescriptors`.
   - Zero omissions and zero duplicates: exactly one physical source is queried per canonical segment.
3. **Federated Scan:** DuckDB combines both sources seamlessly using `UNION ALL`:
```sql
SELECT "@timestamp", "event.id", "segment_id", "record_offset", "json"
FROM read_parquet([$1, $2, ...])
WHERE ...
UNION ALL
SELECT
  json_extract_string(json, '$."@timestamp"') AS "@timestamp",
  json_extract_string(json, '$.event.id') AS "event.id",
  regexp_extract(filename, '([^/\\\\]+)$', 1) AS "segment_id",
  CAST(row_number() OVER (PARTITION BY filename ORDER BY json_extract_string(json, '$."@timestamp"'), json_extract_string(json, '$.event.id'), md5(json)) - 1 AS BIGINT) AS "record_offset",
  json
FROM read_ndjson_objects([$3, $4, ...])
WHERE ...
ORDER BY "@timestamp" ASC, "event.id" ASC, "segment_id" ASC, "record_offset" ASC
LIMIT $limit;
```
This hybrid strategy guarantees **zero query delay** for newly closed JSONL segments, complete keyset cursor continuity across format transitions, and **97.1% disk storage space savings** with Parquet ZSTD compression.

---

## 7. Performance Optimization & Columnar Pushdown (LOGHUB-QUERY-007)

### 7.1 Bottleneck Root Cause Identified
In QUERY-006, analytical queries against Parquet were slower than JSONL scans (e.g. 593ms vs 148ms on search, 96ms vs 63ms on terms) because DuckDB was evaluating `json_extract_string(json, ...)` on raw JSON string columns. This forced decompression and deserialization of the large JSON text payload on every row and prevented DuckDB from pushing down predicates to Parquet dictionary and min/max row-group statistics.

### 7.2 Optimized Columnar Projection & Pushdown
In LOGHUB-QUERY-007, the SQL generator and analytics planner were hardened:
1. **Typed Column Projection:** Projected `tenant_id`, `project_id`, `environment`, `service_name`, `log_level`, `event_action`, and `@timestamp` directly in the Parquet subqueries.
2. **Pushdown Predicates:** Replaced JSON string extraction in WHERE clauses with native column comparisons (`"tenant_id" = $1`, `"project_id" = $2`, `"@timestamp" >= $3`), enabling DuckDB to prune Parquet row groups prior to reading data pages.
3. **Payload Elimination in Analytics:** For analytical aggregations (`date_histogram`, `terms`, `facets`), reading the bulky `json` column is completely eliminated in Parquet-only queries. File I/O drops by >96% and memory usage drops by >90%.

### 7.3 Measured Acceleration Benchmark
Across 50,000 canonical events:
- **Terms Aggregation (`log.level`):** 10.9 ms on Parquet vs 104.0 ms on JSONL (**9.57x Speedup**)
- **Service Filtering:** 13.7 ms on Parquet vs 110.7 ms on JSONL (**8.08x Speedup**)
- **Facets Discovery (`event.action`):** 15.1 ms on Parquet vs 108.8 ms on JSONL (**7.19x Speedup**)
- **Filtered Search:** 37.7 ms on Parquet vs 171.4 ms on JSONL (**4.55x Speedup**)
- **Date Histogram:** 50.3 ms on Parquet vs 135.8 ms on JSONL (**2.70x Speedup**)
- **Storage Space Saved:** 97.6% (15.03 MB down to 0.36 MB)


