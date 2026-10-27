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
- **Status:** Complete (PASS).
- **Scope:**
  - Initialize `apps/query-service` with NestJS/Fastify.
  - Implement Pluggable Query Authentication Guard (`QueryAuthGuard`) and mock test principal.
  - Connect to read-only PostgreSQL metadata repository (`PrismaService`).
  - Implement `ArchiveDiscoveryService`: tenant/project scoping, date range filtering, path traversal defense, and symlink validation against `archive_segments`.
- **Database Migrations:** None (reuses existing Phase 2 `archive_segments` table).
- **Verification:** 56 automated tests passing across unit, integration, and security suites.

### LOGHUB-QUERY-003: DuckDB Execution & Structured Filters
- **Status:** Complete (PASS).
- **Scope:**
  - Install `@duckdb/node-api` dependency in `apps/query-service` with in-memory execution.
  - Implement `DuckDbInstanceManager`: manages in-memory DuckDB connections with `max_memory: 256MB`, `threads: 2`, `autoinstall_known_extensions: false`, `autoload_known_extensions: false`.
  - Implement Clean Architecture query execution port `ILogQueryExecutionPort` and adapter `DuckDbLogQueryAdapter`.
  - Implement `FilterCompilerService`: compiles and bounds structured filters (`eq`, `in`, `contains`, `exists`, `gt`, `gte`, `lt`, `lte`) against canonical ECS allowlist (`docs/query/10-CANONICAL_FIELD_MAPPING.md`).
  - Implement `SqlGeneratorService`: parameterized SQL generation using `read_ndjson_objects([$1, $2, ...])` and bound prepared statements with deterministic tie-breaking (`@timestamp DESC, event.id DESC`).
  - Implement `QueryResourceGovernorService`: concurrency ceilings (4 slots), queue depth limits (16), tenant fairness, and true cancellation via `conn.interrupt()`.
  - Implement `QueryPlannerService`: validates authorized project scope, discovers verified segments, enforces segment/byte limits, and constructs immutable `AuthorizedLogQueryPlan`.
- **Database Migrations:** None (0 schema changes).
- **Verification:** 90 automated query-service tests passing (34 new tests), 0 regressions.
  - Implement `FilterCompiler`: compiles allowlisted structured filter DSL into parameterized DuckDB SQL.
  - Implement full-text search translation over `message` using DuckDB string predicates.
- **Database Migrations:** None.
- **Verification:** Unit tests for filter AST generation and SQL injection defense.

### LOGHUB-QUERY-004: Search API, Keyset Cursor Pagination & Validation
- **Status:** Complete (PASS).
- **Scope & Deliverables:**
  - Implemented `POST /query/v1/logs/search` and `GET /query/v1/logs/{eventId}` in `SearchController`.
  - Resolved QUERY-003 acceptance issues: P0-A Pre-Read Tenant Isolation Gate, P0-B 4-Part Composite Keyset Pagination `(@timestamp, event.id, segment_id, record_offset)`, and P0-C Test-Count Reconciliation.
  - Implemented `CursorCodecService`: HMAC-SHA256 authenticated opaque base64url cursor with constant-time `crypto.timingSafeEqual`, query fingerprinting, tenant binding, and key rotation support.
  - Implemented `SearchValidationPipe` enforcing `contracts/query/v1/search-request.schema.json` via Ajv (Draft 2020-12).
  - Implemented `EventLookupValidationPipe` validating UUIDv4 and project scoping.
  - Kept deferred endpoints (`aggregate`, `facets`) strictly returning HTTP 501 Problem Details.
  - Thin controller (86 lines) adhering to Clean Architecture with zero direct Prisma/SQL dependencies.
- **Database Migrations:** None (0 schema changes).
- **Verification:** 116 automated query-service tests passing across 19 suites (26 new tests), 0 failing, 0 skipped. Zero regressions in contracts (45) or ingestion gateway (120).

### LOGHUB-QUERY-005: Aggregations, Facets & Date Histograms
- **Status:** Complete (PASS).
- **Scope & Deliverables:**
  - Resolved carry-forward risks:
    - **P0-A (Stable Physical Record Locator):** Replaced non-deterministic `row_number() OVER (PARTITION BY filename)` with deterministic multi-key ordering `CAST(row_number() OVER (PARTITION BY filename ORDER BY json_extract_string(json, '$."@timestamp"'), json_extract_string(json, '$.event.id'), md5(json)) - 1 AS BIGINT)` to prevent thread races across parallel workers.
    - **P0-B (Trusted Archive Descriptor Provenance):** Verified and enforced pre-read security gate in `DuckDbLogQueryAdapter` validating tenant ownership, authorized project scoping, `VERIFIED` status, canonical root containment, absolute path existence, and exact file `byteSize` matching disk before DuckDB opens any files.
  - Implemented `POST /query/v1/logs/aggregate` supporting `date_histogram` (intervals `1m`, `5m`, `15m`, `1h`, `6h`, `1d` with strict UTC bucket alignment via DuckDB `time_bucket`), `terms` (bounded counts with `size` 1-50), and `cardinality` (distinct counts via `count(DISTINCT ...)`).
  - Implemented `POST /query/v1/logs/facets` discovering unique values and frequencies for `service.name`, `log.level`, `event.action`, `environment`, and `error.type`. Respects active filters and caller authorization.
  - Implemented `AggregateValidationPipe` and `FacetsValidationPipe` enforcing JSON Schema Draft 2020-12, rejecting unknown properties (`additionalProperties: false`), non-UTC timestamps, inverted time ranges, ranges > 30 days, histogram buckets > 2000, and unallowlisted fields with RFC 7807 problem details.
  - Hardened HTTP method enforcement with strict `405 Method Not Allowed` on `GET` for both `/query/v1/logs/aggregate` and `/query/v1/logs/facets`.
  - Implemented analytical audit events (`AGGREGATION_REQUESTED`, `AGGREGATION_COMPLETED`, `FACETS_REQUESTED`, `FACETS_COMPLETED`, `ANALYTICS_REJECTED`, `ANALYTICS_TIMEOUT`).
  - Implemented `AnalyticsSqlGeneratorService` compiling parameterized DuckDB SQL with row-level tenant and project isolation.
  - Ultra-thin `AnalyticsController` (57 lines) adhering to Clean Architecture.
- **Database Migrations:** None (0 schema changes).
- **Verification:** 162 automated query-service tests passing across 24 suites (46 new tests), 0 failing, 0 skipped. Zero regressions in contracts (45) or ingestion gateway (120). Total active-suite tests: 327 passing.

### LOGHUB-QUERY-006: Derived Parquet Converter, Catalog & Query Parity
- **Status:** Complete (PASS).
- **Scope & Deliverables:**
  - Implemented Parquet Cache Module (`apps/query-service/src/modules/parquet-cache/`) with Clean Architecture separation.
  - Zero Database Migrations: Deployed high-performance file-backed catalog (`FileParquetCatalogService`) storing derived metadata alongside Parquet files with SHA-256 source checksum drift detection.
  - Implemented `DuckDbParquetConverter` utilizing DuckDB `COPY (...) TO ... (FORMAT PARQUET, COMPRESSION ZSTD)` achieving 97.1% storage reduction over canonical JSONL.
  - Atomic Staging Publication: Materialization writes to unique `.staging/` paths (`.tmp-conv` and `.tmp-meta.json`) and atomically moves to final paths only upon verification.
  - Implemented `RecoverMaterializationUseCase` sweeping abandoned staging artifacts upon restart.
  - Implemented `HybridSourcePlannerService`: transparently partitions query targets into Parquet and canonical JSONL with zero duplicates, zero dropped segments, and automatic fallback on corruption or missing caches.
  - Keyset Cursor Compatibility: Preserved 4-part composite locator tuple `(@timestamp, event.id, segment_id, record_offset)` allowing seamless cursor continuation across source substitutions.
  - Verified 100% result parity for Search, structured filters, date histograms, terms aggregations, and dynamic facets.
- **Database Migrations:** None (0 database migrations; file-backed catalog).
- **Verification:** 194 automated query-service tests passing across 32 suites (32 new tests), 0 failing, 0 skipped. Zero regressions in contracts (45) or ingestion gateway (120). Total active-suite tests: 359 passing.

### LOGHUB-QUERY-007: Enterprise Security, Query Performance Optimization, Reliability & Operational Hardening
- **Status:** Complete (PASS).
- **Scope & Deliverables:**
  - **Parquet Query Performance Optimization (P0-A, P0-B):** Investigated and resolved the QUERY-006 Parquet latency regression. Eliminated raw JSON string column extraction from analytical queries (`date_histogram`, `terms`, `facets`), projecting typed Parquet columns and enabling DuckDB columnar predicate pushdown. Achieved up to 9.57x speedup over JSONL on 50,000 events.
  - **Hybrid Source Selection Modes (P0-C):** Added explicit `QUERY_SOURCE_MODE` (`hybrid`, `jsonl_only`, `parquet_only`) for deterministic routing and isolated testing without exposing physical paths.
  - **Stable Event Identity over Byte-Identical Duplicates (P0-D):** Verified and proved that the 4-part composite locator tuple `(@timestamp, event.id, segment_id, record_offset)` provides 100% gapless sequential keyset pagination over byte-identical duplicate records in both JSONL and Parquet, and across format transitions (`stable-locator-duplicate-pagination.test.ts`).
  - **Derived Cache Provenance & Filesystem Security (P0-E):** Enforced read-time identity checks, source hash verification, strict directory boundary validation, and documented OS-level TOCTOU defense invariants.
  - **Atomic Publication & Crash Recovery (P0-F):** Implemented `cleanupOrphanedStagingFiles` in `DuckDbParquetConverter` to purge stale temporary conversion artifacts.
  - **Multi-Tenant Fairness & Cancellation (P0-G):** Resolved saturated tenant queue dispatch defect in `QueryResourceGovernorService`; verified strict tenant concurrency capping, `AbortSignal` queue eviction, query timeout slot release, and bounded queue overflow rejection (`tenant-fairness-cancellation.test.ts`).
  - **Zero Database Migrations:** Preserved 0-migration development architecture without modifying PostgreSQL schema.
- **Database Migrations:** None (0 schema changes).
- **Verification:** 201 automated query-service tests passing across 34 suites (7 new tests), 0 failing, 0 skipped. Total monorepo active suite: 366 passing.

### LOGHUB-QUERY-008: Phase 3 Final Functional, Security & Architecture Acceptance
- **Status:** Complete (PASS).
- **Scope & Deliverables:**
  - Complete 30-Dimension Traceable Acceptance Matrix created in `docs/query/11-PHASE3_ACCEPTANCE_MATRIX.md` (`ACC-001` through `ACC-030`).
  - Operational Readiness & Deployment Gaps Document authored in `docs/query/12-PHASE3_OPERATIONS_GAPS.md`.
  - Comprehensive end-to-end integration pipeline test implemented in `apps/query-service/tests/integration/phase3-end-to-end-pipeline.test.ts` (9 tests passing).
  - Validated full supported pipeline: representative SDK emits events $\rightarrow$ shipper delivers to Gateway WAL $\rightarrow$ archiver commits canonical partition with signed manifest $\rightarrow$ Parquet converter derives compressed columnar cache $\rightarrow$ Query Service serves Search, Keyset Pagination, Lookup, Aggregations, and Facets via HTTP with zero canonical data mutation.
  - Independently verified all P0 invariants: pre-read file security, 4-part composite locator `(@timestamp, event.id, segment_id, record_offset)`, HMAC-SHA256 cursor integrity, DuckDB sandboxing, and resource governance.
  - Monorepo active test baseline reconciled at **630 passing automated tests** across all 10 packages with 0 failures and 0 skips.
- **Database Migrations:** None (0 database migrations).
- **Verification:** 210 query-service tests passing (35 suites); 630 total monorepo automated tests passing. Zero regressions.

---

## 3. Phase 4 Roadmap & Prerequisites: Dashboard, Observability & Enterprise Operations

With Phase 3 complete and certified (PASS), Skyra LogHub is prepared for Phase 4:

### 3.1 Upcoming Phase 4 Milestones
1. **LOGHUB-DASH-001: Angular Web Dashboard & Query UI**
   - Interactive log search view with time-range picker, severity filters, and structured field search.
   - Live date histogram and terms distribution charts.
   - Keyset cursor infinite scrolling and detail drawer with raw ECS JSON viewer.
2. **LOGHUB-DASH-002: Dynamic Facet Explorer & Field Aggregations**
   - Sidebar facet discovery with click-to-filter capability.
   - Saved searches and dashboard panel configurations.
3. **LOGHUB-OPS-001: Production OIDC/JWKS & Distributed Deployment Hardening**
   - Corporate identity provider integration (Entra ID, Okta, Keycloak).
   - Distributed multi-replica query worker deployment with read-only archive mounts.
   - Distributed lock coordinator for Parquet materialization workers.

### 3.2 Prerequisites Satisfied for Phase 4
- Stable, versioned OpenAPI 3.1.0 contracts for `/query/v1/logs/search`, `/logs/:eventId`, `/logs/aggregate`, and `/logs/facets`.
- Zero-drift canonical ECS schema v1.0.0.
- High-performance DuckDB analytical backend delivering sub-15ms queries on derived Parquet.
- Tamper-proof, signed HMAC-SHA256 keyset pagination.


