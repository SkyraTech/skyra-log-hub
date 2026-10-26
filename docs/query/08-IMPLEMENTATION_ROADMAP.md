# Phase 3 Implementation Roadmap: Query, Search & Analytics

**Document Version:** 1.0.0  
**Status:** Approved Architecture Specification  
**Task Reference:** LOGHUB-QUERY-001  
**Target Delivery:** Tasks QUERY-001 through QUERY-008

---

## 1. Phase 3 Task Sequencing

Phase 3 transitions Skyra LogHub from a durable ingestion and archival platform into a searchable, analyzable log management platform. Tasks are structured sequentially to maintain safety invariants, test coverage, and clear rollback boundaries.

```text
LOGHUB-QUERY-001 (Architecture, Contracts & Threat Model)  [CURRENT - PASS]
         │
         ▼
LOGHUB-QUERY-002 (Query Service Foundation & Secure Archive Discovery)
         │
         ▼
LOGHUB-QUERY-003 (DuckDB In-Memory Execution & Structured Filters)
         │
         ▼
LOGHUB-QUERY-004 (Search API, Keyset Cursor Pagination & Validation)
         │
         ▼
LOGHUB-QUERY-005 (Aggregations, Facets & Date Histograms)
         │
         ▼
LOGHUB-QUERY-006 (Derived Parquet Converter, Catalog & Query Parity)
         │
         ▼
LOGHUB-QUERY-007 (Resource Governance, Concurrency & Security Hardening)
         │
         ▼
LOGHUB-QUERY-008 (Phase 3 Final Acceptance & Certification)
```

---

## 2. Detailed Task Definitions

### LOGHUB-QUERY-001: Architecture, Contracts & Analytical Storage Design
- **Status:** Complete (PASS).
- **Scope:** Repository audit, DuckDB feasibility spike, versioned OpenAPI & JSON Schemas, ADR-017 through ADR-021, and architectural documentation.
- **Deliverables:** `contracts/query/v1/*`, `tests/contracts/query-contracts.test.ts`, `docs/query/*`.

### LOGHUB-QUERY-002: Query Service Foundation & Secure Archive Discovery
- **Scope:**
  - Initialize `apps/query-service` with NestJS/Fastify.
  - Implement Pluggable Query Authentication Guard (`QueryAuthGuard`) and mock test principal.
  - Connect to read-only PostgreSQL metadata repository (`PrismaService`).
  - Implement `ArchiveDiscoveryService`: tenant/project scoping, date range filtering, path traversal defense, and symlink validation against `archive_segments`.
- **Database Migrations:** None (reuses existing Phase 2 `archive_segments` table).
- **Verification:** Discovery unit and integration tests across synthetic segment trees.

### LOGHUB-QUERY-003: DuckDB Execution & Structured Filters
- **Scope:**
  - Install `@duckdb/node-api` dependency in `apps/query-service`.
  - Implement `DuckDbPoolService`: manages in-memory DuckDB connections with `max_memory` and `enable_external_access = false`.
  - Implement `FilterCompiler`: compiles allowlisted structured filter DSL into parameterized DuckDB SQL.
  - Implement full-text search translation over `message` using DuckDB string predicates.
- **Database Migrations:** None.
- **Verification:** Unit tests for filter AST generation and SQL injection defense.

### LOGHUB-QUERY-004: Search API, Keyset Cursor Pagination & Validation
- **Scope:**
  - Implement `POST /query/v1/logs/search` and `GET /query/v1/logs/{eventId}`.
  - Implement `CursorCodecService`: HMAC-SHA256 signer and parser for keyset pagination cursors.
  - Integrate request validation against `search-request.schema.json`.
  - Wire search execution, keyset SQL clauses, and archive watermark calculation.
- **Database Migrations:** None.
- **Verification:** Pagination stability tests, cursor tampering rejection tests.

### LOGHUB-QUERY-005: Aggregations, Facets & Date Histograms
- **Scope:**
  - Implement `POST /query/v1/logs/aggregate` and `POST /query/v1/logs/facets`.
  - Implement `date_histogram` bucket generator with configurable UTC intervals (`1m`, `5m`, `1h`, `1d`).
  - Implement `terms` aggregation for high-performance categorical distribution.
  - Integrate validation against `aggregate-request.schema.json` and `facets-request.schema.json`.
- **Database Migrations:** None.
- **Verification:** Aggregation correctness tests against known synthetic log batches.

### LOGHUB-QUERY-006: Derived Parquet Converter, Catalog & Query Parity
- **Scope:**
  - Propose and deploy PostgreSQL migration: `parquet_segments` metadata catalog table.
  - Implement `ParquetConversionWorker`: background worker converting finalized JSONL segments into ZSTD-compressed Parquet.
  - Implement atomic file replacement (`.tmp-conv` -> `.parquet`) and SHA-256 integrity verification.
  - Update `DuckDbPoolService` to perform hybrid querying (reading Parquet where available, falling back to JSONL).
- **Database Migrations:** **MIGRATION REQUIRED** (New `parquet_segments` table).
- **Verification:** 100% result parity tests comparing JSONL execution vs Parquet execution.

### LOGHUB-QUERY-007: Resource Governance, Concurrency & Security Hardening
- **Scope:**
  - Implement `FairQueueScheduler`: Deficit Round-Robin tenant concurrency queue.
  - Implement `TimeoutInterceptor`: AbortController integration with `DuckDBConnection.interrupt()`.
  - Enforce maximum time range, segment count, and scanned byte ceilings.
  - Implement `QueryAuditService`: writes audit records to PostgreSQL `query_audit_logs`.
- **Database Migrations:** **MIGRATION REQUIRED** (New `query_audit_logs` table).
- **Verification:** Fault injection tests for query timeouts, client cancellations, and memory exhaustion.

### LOGHUB-QUERY-008: Phase 3 Final Functional Acceptance
- **Scope:**
  - Execute full 30-scenario test matrix (`QTEST-01` through `QTEST-30`).
  - Full end-to-end integration: Ingest logs via SDK $\rightarrow$ Finalize segment $\rightarrow$ Query via Search API $\rightarrow$ Verify results and watermark.
  - Benchmark query latency and throughput.
  - Issue Phase 3 Final Acceptance Report.
- **Database Migrations:** None.
- **Verification:** 100% automated test pass, zero regressions across Phase 1 and Phase 2 suites.
