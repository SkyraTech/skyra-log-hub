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

### 3.1 Function Invocation
DuckDB scans JSONL segments using:
```sql
SELECT 
  "@timestamp" AS event_time,
  "event"."id" AS event_id,
  "log"."level" AS log_level,
  "message" AS message,
  "service"."name" AS service_name,
  "skyra"."tenant_id" AS tenant_id,
  "skyra"."project_id" AS project_id
FROM read_json_auto(
  $1::VARCHAR[],
  format='newline_delimited',
  ignore_errors=false,
  maximum_object_size=16777216
)
WHERE "skyra"."tenant_id" = $2
  AND "skyra"."project_id" = ANY($3::VARCHAR[])
  AND "@timestamp" >= $4::TIMESTAMP
  AND "@timestamp" < $5::TIMESTAMP
```

### 3.2 Schema Projection & Optimization
- DuckDB's `read_json_auto` automatically detects the schema of canonical JSONL. For deterministic performance, the Query Service supplies explicit column definitions (`columns={...}`) for top-level canonical fields (`@timestamp`, `event`, `log`, `message`, `service`, `trace`, `skyra`).
- By declaring explicit column projections, DuckDB bypasses parsing JSON keys not referenced in the query, reducing deserialization CPU by up to 60%.

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

## 6. Query Engine Hybrid Execution

When serving queries across a time range:
1. **Catalog Query:** The query planner inspects PostgreSQL metadata for the target time range.
2. **File Selection:**
   - If Parquet exists and is marked `ACTIVE` for a segment $\rightarrow$ Route segment to Parquet input list.
   - If Parquet is missing, pending conversion, or corrupt $\rightarrow$ Route segment to canonical JSONL input list.
3. **Federated Scan:** DuckDB combines both sources seamlessly:
```sql
WITH parquet_events AS (
  SELECT * FROM read_parquet($1::VARCHAR[]) WHERE ...
),
jsonl_events AS (
  SELECT * FROM read_json_auto($2::VARCHAR[]) WHERE ...
)
SELECT * FROM parquet_events
UNION ALL
SELECT * FROM jsonl_events
ORDER BY "@timestamp" DESC, "event"."id" DESC
LIMIT 50;
```
This hybrid strategy guarantees **zero query delay** for newly closed JSONL segments while delivering 10x-50x speedups for historical segments converted to Parquet.
