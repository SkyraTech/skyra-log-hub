# Skyra LogHub — Query Architecture & System Decomposition

**Document ID:** `LOGHUB-DOC-QUERY-001`  
**Task Reference:** `LOGHUB-QUERY-001`  
**Phase:** Phase 3 (Query, Search & Analytics)  
**Status:** Architecture Specification & Baseline  
**Architecture Reference:** ADR-011, ADR-014, ADR-017, ADR-018, ADR-019, ADR-020, ADR-021

---

## 1. System Mission & Core Principles

The Skyra LogHub Query Service makes centrally archived application logs **searchable, filterable, analyzable, and accessible through secure APIs** for the Angular Log Explorer, developer CLI tools, and future AI/MCP investigative agents.

### Core Architectural Axioms:
1. **The Immutable JSONL Archive is the Source of Truth:**
   - Canonical JSONL log segments written during Phase 2 ingestion remain the permanent, unalterable historical record.
   - DuckDB and Parquet are query-serving and read acceleration technologies. Parquet files are derived, reproducible artifacts that can be wiped, rebuilt, or re-partitioned at any time without data loss.
2. **Workload & Fault Domain Isolation:**
   - Query workloads (which may involve complex aggregations, scanning millions of records, and high memory usage) are physically isolated in an independent service (`apps/query-service`) from the Ingestion Gateway (`apps/ingestion-gateway`). Expensive or runaway queries cannot starve physical WAL fsync throughput or disrupt log admission.
3. **Server-Authoritative Tenant and Project Scoping:**
   - Client requests cannot declare their own authorization scope. The query service validates the caller's authenticated identity against PostgreSQL metadata, computing an effective allowlist of projects. Archive discovery prunes files strictly within this trusted boundary before DuckDB is invoked.
4. **Deterministic and Tamper-Evident Keyset Pagination:**
   - Keyset cursor pagination uses stable composite keys (`@timestamp`, `event.id`, and physical record offset). Cursors are cryptographically signed with HMAC-SHA256 and bound to query parameters and tenant identity.
5. **Fail-Closed Resource Governance:**
   - Every query runs with explicit CPU thread caps, memory ceilings, time limits, and scanned byte quotas. Queries exceeding resource budgets fail closed with structured, descriptive errors.

---

## 2. End-to-End Query Architecture

```text
                               Client Layer
                ┌──────────────────────────────────────┐
                │   Angular Log Explorer / AI Tools    │
                └──────────────────┬───────────────────┘
                                   │ (HTTPS / Bearer JWT)
                                   v
                             Security Layer
                ┌──────────────────────────────────────┐
                │ Query Authentication & Scope Guard   │
                │ - Token Validation & Tenant Binding  │
                │ - Allowed Projects Filter Pruning    │
                └──────────────────┬───────────────────┘
                                   │
                                   v
                             Planning Layer
                ┌──────────────────────────────────────┐
                │ Query Planner & Archive Discovery   │
                │ - Time Window & Partition Pruning    │
                │ - PostgreSQL Catalog Segment Filter  │
                │ - Path Verification & Traversal Guard│
                │ - Keyset Cursor Decode & Validation  │
                └──────────────────┬───────────────────┘
                                   │
                                   v
                             Execution Layer
                ┌──────────────────────────────────────┐
                │ DuckDB Embedded Query Engine         │
                │ - In-Memory Ephemeral Instance       │
                │ - Read JSONL (`read_json_auto`)      │
                │ - Read Parquet (`read_parquet`)      │
                │ - Parameterized Predicate Evaluation │
                │ - Memory & Thread Resource Ceilings  │
                └──────────────────┬───────────────────┘
                                   │
                                   v
                             Storage Layer
         ┌─────────────────────────┴─────────────────────────┐
         │                                                   │
         v                                                   v
┌─────────────────────────┐                         ┌─────────────────┐
│ Immutable JSONL Archive │                         │ Derived Parquet │
│ (Canonical Source)      │                         │ (Acceleration)  │
└─────────────────────────┘                         └─────────────────┘
```

---

## 3. Query Service Logical Decomposition

The Query Service is decomposed into clean, single-responsibility modules:

| Module | Responsibility | Trust Boundary |
|---|---|---|
| **QueryAuthModule** | Validates user/developer Bearer tokens, resolves tenant membership, queries PostgreSQL for allowed projects and environments (`ProjectAuthorizationService`). | Edge authentication boundary |
| **ArchiveDiscoveryModule** | Queries PostgreSQL `archive_segments` catalog, matches requested time ranges, verifies `.manifest.json` integrity, generates safe server-owned file lists. | Storage discovery boundary |
| **QueryExecutionModule** | Orchestrates query planning, filter compilation, SQL generation, resource governance, and analytical execution (`ILogQueryExecutionPort`). | Application execution boundary |
| **FilterCompilerService** | Validates structured client filters against `CANONICAL_FIELD_CATALOG`, validates types and operator compatibility, bounds string lengths (<= 512) and array sizes (<= 100), and emits typed AST. | Validation & parsing boundary |
| **SqlGeneratorService** | Translates authorized query plans and filter ASTs into parameterized DuckDB SQL using `read_ndjson_objects([$1, ...])` with row-level tenant WHERE clauses and deterministic tie-breaker sorting. | SQL generation boundary |
| **DuckDbEngine (Infrastructure)** | Manages in-memory DuckDB connection lifecycle (`DuckDbInstanceManager`), hardened with `autoinstall_known_extensions: false`, `autoload_known_extensions: false`, 256MB memory, and 2 threads. | Analytical execution boundary |
| **QueryResourceGovernorService** | Enforces 4 concurrent execution slots, max 16 queue depth, tenant fairness, and native `conn.interrupt()` cancellation on timeout or abort signal. | Operational protection boundary |
| **CursorCodecService** | Generates and verifies HMAC-SHA256 signed pagination tokens bound to query fingerprints, timestamps, and tenant IDs (`src/modules/search/application/cursor-codec.service.ts`). | Pagination security boundary |
| **AnalyticsModule** | Translates date histogram, terms, cardinality, and dynamic facet requests into optimized DuckDB GROUP BY queries with UTC interval alignment (`src/modules/analytics/` & `AnalyticsSqlGeneratorService`). | Analytical computation boundary |

---

## 4. Query Execution Lifecycle

1. **Request Ingress:** Client submits `POST /query/v1/logs/search` with JSON body containing `time_range`, optional project/service/level filters, and limit.
2. **Authentication & Authorization:** Guard verifies user token, extracts `tenant_id`, and queries `tenants` and `projects` tables. If client requested `projects: ["skyra-core"]`, the guard confirms the user has access. If user omitted projects, guard defaults to all authorized projects for that user.
3. **Partition & Segment Pruning:**
   - Planner extracts UTC date range: `date >= start.slice(0, 10)` and `date <= end.slice(0, 10)`.
   - Queries `archive_segments` table for segments matching `(tenant_id, projects, environments, date_range)`.
   - Filters out segments where `last_event_timestamp < start` or `first_event_timestamp >= end`.
4. **File List Construction & Path Containment:**
   - Resolves physical paths using `path.resolve(ARCHIVE_ROOT, tenant, project, env, service, date, filename)`.
   - Verifies path is strictly contained within `ARCHIVE_ROOT`.
   - If derived Parquet file exists and manifest checksum matches, Parquet is selected; otherwise canonical JSONL is selected.
5. **DuckDB Query Compilation:**
   - Builds parameterized SQL: `SELECT ... FROM read_json_auto(['path1', 'path2']) WHERE ... ORDER BY "@timestamp" DESC, event.id DESC LIMIT $limit`.
   - Binds parameters securely (`$1`, `$2`, etc.).
6. **Execution & Keyset Pagination:**
   - Fetches `limit + 1` rows to determine `has_more`.
   - If `has_more` is true, generates signed `next_cursor` from row `limit`.
7. **Response Serialization:** Emits JSON response conforming to `search-response.schema.json` with execution statistics and effective search scope.
