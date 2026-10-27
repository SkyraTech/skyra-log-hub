# Query Service Correctness & Safety Testing Strategy

**Document Version:** 1.0.0  
**Status:** Approved Architecture Specification  
**Task Reference:** LOGHUB-QUERY-001  
**Applies To:** Query Service Implementation & Verification (`apps/query-service`)

---

## 1. Testing Philosophy & Test Pyramid

Query correctness, multi-tenant isolation, and resilient pagination require exhaustive automated testing across unit, integration, and security boundaries.

```text
               ▲
              / \     End-to-End Search Scenarios (Dashboard & API)
             /   \    (Cross-Tenant Leaks, Freshness Watermarks)
            /─────\
           /       \   Integration Tests (Real DuckDB, PostgreSQL Catalog,
          /         \  Simulated Archive Files, Corrupt JSONL/Parquet)
         /───────────\
        /             \ Contract & Security Tests (OpenAPI, JSON Schema,
       /               \ SQL Injection, Path Traversal, Cursor Tampering)
      /─────────────────\
     /                   \ Unit Tests (Filter AST, Query Planner Pruning,
    /                     \ Keyset Encoder/Decoder, Fair Scheduler)
   └───────────────────────┘
```

---

## 2. Traceable 30-Scenario Acceptance Matrix

Every requirement identified in LOGHUB-QUERY-001 maps to a designated test scenario in the test matrix:

| Scenario ID | Test Name | Focus Area | Expected Behavior |
| :--- | :--- | :--- | :--- |
| **QTEST-01** | `testTenantIsolationStrict` | Security | Principal in Tenant A cannot query or observe records from Tenant B. |
| **QTEST-02** | `testProjectScopeIntersection` | Authorization | Query without project selection returns only principal's authorized projects. |
| **QTEST-03** | `testForbiddenProjectAccess` | Authorization | Requesting project outside principal's scope fails with `403 Forbidden`. |
| **QTEST-04** | `testEmptyResultSetHandling` | Correctness | Queries matching zero records return `items: []`, `has_more: false`, 200 OK. |
| **QTEST-05** | `testUtcBoundaryInclusiveExclusive` | Correctness | Records at `start` are included; records at `end` are strictly excluded. |
| **QTEST-06** | `testIdenticalTimestampOrdering` | Correctness | Events with identical `@timestamp` ordered deterministically by `event.id`. |
| **QTEST-07** | `testDuplicateEventIdResilience` | Robustness | Accidental duplicate event IDs resolve deterministically without engine crash. |
| **QTEST-08** | `testMissingOptionalFields` | Correctness | Events lacking optional ECS fields (`trace.id`, `error.type`) query cleanly. |
| **QTEST-09** | `testUnicodeAndSpecialCharacters` | Correctness | Non-ASCII messages (emoji, CJK, accents) search and match accurately. |
| **QTEST-10** | `testEscapedJsonStringsInMessage` | Correctness | Messages containing nested escaped JSON or quotes parse without syntax error. |
| **QTEST-11** | `testStructuredFieldEquality` | Filtering | Operator `eq` correctly matches string, boolean, and numerical values. |
| **QTEST-12** | `testStructuredFieldInOperator` | Filtering | Operator `in` correctly matches any item in the target array. |
| **QTEST-13** | `testStructuredFieldComparisonRange` | Filtering | Operators `gt`, `gte`, `lt`, `lte` correctly filter numbers and timestamps. |
| **QTEST-14** | `testStructuredFieldExists` | Filtering | Operator `exists: true/false` matches presence or absence of nested field. |
| **QTEST-15** | `testInvalidFilterFieldRejection` | Security | Non-allowlisted field paths (`user.password`, `foo.bar`) reject with 400. |
| **QTEST-16** | `testSqlInjectionDefense` | Security | Injection attempts in strings or filters (`' OR 1=1 --`) fail safely without execution. |
| **QTEST-17** | `testPathTraversalDefense` | Security | Path traversal strings in headers or parameters cannot escape `ARCHIVE_ROOT`. |
| **QTEST-18** | `testSymlinkEscapeDefense` | Security | Symlinks pointing outside `ARCHIVE_ROOT` are detected and rejected. |
| **QTEST-19** | `testCorruptArchiveSegmentHandling` | Reliability | Corrupt JSON line in segment logs error and does not abort entire batch. |
| **QTEST-20** | `testMissingSegmentHandling` | Reliability | Segment in catalog but missing from disk produces warning and partial result. |
| **QTEST-21** | `testChecksumMismatchDetection` | Reliability | Altered archive segment detected during verification and flagged as corrupt. |
| **QTEST-22** | `testPartiallyFinalizedSegmentSafety`| Durability | Active/open segments in ingestion are ignored until marked `CLOSED`. |
| **QTEST-23** | `testQueryExecutionTimeout` | Governance | Query exceeding timeout threshold cancels DuckDB execution and returns 504. |
| **QTEST-24** | `testQueryClientCancellation` | Governance | Client disconnect triggers immediate DuckDB interrupt and resource cleanup. |
| **QTEST-25** | `testMemoryLimitEnforcement` | Governance | Query exceeding `max_memory` triggers controlled error (429/500). |
| **QTEST-26** | `testFairShareTenantConcurrency` | Scheduling | Heavy queries from Tenant A do not delay lightweight queries from Tenant B. |
| **QTEST-27** | `testCursorSignatureTampering` | Security | Modified cursor signature or payload returns `400 Bad Request`. |
| **QTEST-28** | `testCursorFilterMismatch` | Security | Replaying cursor on different filter query returns `400 Bad Request`. |
| **QTEST-29** | `testJsonlParquetParity` | Analytics | Identical query against raw JSONL vs converted Parquet returns identical rows. |
| **QTEST-30** | `testArchiveFreshnessWatermark` | Consistency | Response metadata accurately reflects latest evaluated segment timestamp. |

---

## 3. Test Fixtures & Synthetic Corpus

To ensure tests are completely reproducible without external database dependencies:
1. **In-Memory PostgreSQL Fixture:** Integration tests utilize an ephemeral PostgreSQL instance or mock repository matching Prisma schemas.
2. **Synthetic Archive Segments:** Test suites generate synthetic JSONL and Parquet segments in a temporary test directory (`/tmp/skyra-test-archive-<uuid>`) using Phase 1 ECS canonical schemas.
3. **No External Network Dependencies:** All tests run strictly offline.

---

## 4. Query Service Test Suite Inventory (LOGHUB-QUERY-004 Verified)

As of LOGHUB-QUERY-004, `apps/query-service` contains **116 automated tests across 19 suites** (100% passing, 0 failing, 0 skipped):

| Category | Suite File | Tests | Focus Area |
| :--- | :--- | :--- | :--- |
| **Search API** | `tests/integration/search-api.test.ts` | 9 | `POST /query/v1/logs/search`, keyset pagination, tenant isolation, `GET /query/v1/logs/:eventId`, 501 stubs |
| **Cursor Codec** | `tests/unit/search/cursor-codec.test.ts` | 7 | HMAC-SHA256 signing, constant-time verification, tampering, expiration, query fingerprinting |
| **Validation** | `tests/unit/search/search-validation-pipe.test.ts` | 9 | Schema Draft 2020-12 validation, unknown fields, bad UTC, malicious injection payloads |
| **SQL Generator** | `tests/unit/query-execution/sql-generator.test.ts` | 6 | 4-part composite locator ordering, window functions, keyset SQL, parameters |
| **DuckDB Execution** | `tests/integration/duckdb-execution.test.ts` | 10 | DuckDB scans, limits, cancellation interrupts, timeouts, resource controls |
| **Archive Integration**| `tests/integration/real-archive-query.test.ts` | 4 | Real Phase 2 archive folder structure, catalog matching, manifest verification |
| **Query Isolation** | `tests/security/query-isolation.test.ts` | 6 | SQL injection defense, pre-read tenant isolation, foreign descriptor rejection |
| **Architecture** | `tests/security/architecture-boundaries.test.ts` | 6 | Clean Architecture boundaries, controller thinness (<=120 lines), no raw SQL |
| **Security** | `tests/security/security-boundaries.test.ts` | 5 | Bearer token validation, cross-tenant rejection, path traversal rejection |
| **HTTP & Contracts** | `tests/integration/query-http.test.ts` | 14 | Discovery endpoints, correlation headers, RFC 7807 problem details, HTTP error mapping |
| **Archive Integrity** | `tests/integration/archive-integrity.test.ts` | 1 | SHA-256 manifest mismatch detection and corruption rejection |
| **Config** | `tests/unit/config/query-config.test.ts` | 5 | Fail-fast config validation, secret validation, defaults |
| **Auth** | `tests/unit/auth/jwt-verification.test.ts` | 7 | HS256/RS256/EdDSA JWT verification, expired tokens, invalid signatures |
| **Authorization** | `tests/unit/auth/project-authorization.test.ts` | 7 | Project intersection, wildcard access, empty grant rejection |
| **Path Safety** | `tests/unit/archive/path-safety.test.ts` | 7 | Traversal defense, date regex validation, canonical root containment |
| **Manifest** | `tests/unit/archive/manifest-verifier.test.ts` | 4 | SHA-256 verification against JSON manifests, byte count checks |
| **Discovery** | `tests/unit/archive/archive-discovery.test.ts` | 4 | Time range filtering, project scoping, sanitized DTO mapping |
| **Filter Compiler** | `tests/unit/query-execution/filter-compiler.test.ts` | 3 | AST compilation, type validation, comparison operators |
| **Resource Governor** | `tests/unit/query-execution/query-resource-governor.test.ts` | 2 | Concurrency limits, bounded queue, per-tenant fair scheduling |
| **Aggregate Validation** | `tests/unit/analytics/aggregate-validation-pipe.test.ts` | 11 | Schema validation, time interval bounds, histogram bucket ceilings, field allowlists |
| **Facets Validation** | `tests/unit/analytics/facets-validation-pipe.test.ts` | 10 | Schema validation, allowed facet fields, duplicate detection, bad ranges |
| **Analytics SQL Generator**| `tests/unit/analytics/analytics-sql-generator.test.ts` | 5 | Date histogram `time_bucket`, terms group-by, cardinality, facet SQL |
| **Analytics API** | `tests/integration/analytics-api.test.ts` | 14 | E2E `POST /query/v1/logs/aggregate` & `facets`, date histograms, terms, filters, project scoping, 405 on GET |
| **Analytics Security** | `tests/security/analytics-security.test.ts` | 6 | P0-A multi-thread stable locator, P0-B pre-read descriptor gate, tenant isolation, PERF-1 benchmark |
| **Total** | **24 Suites** | **162** | **100% Pass Rate (0 Failed, 0 Skipped)** |

---

## 5. Analytical Verification & Benchmark Suite (LOGHUB-QUERY-005)

LOGHUB-QUERY-005 added comprehensive end-to-end analytical testing and performance verification:
1. **Histogram Bucket Math:** Exact UTC alignment using DuckDB `time_bucket` without local timezone drift.
2. **Cardinality Ceilings:** Max 2,000 buckets enforced at preflight; terms aggregation size capped at 50.
3. **P0-A Stable Record Locator:** Multi-threaded window partition ordering verified deterministically across parallel DuckDB workers with identical timestamps and duplicate event IDs.
4. **P0-B Descriptor Provenance:** Verified that unauthorized foreign tenant segments are rejected at the pre-read boundary before DuckDB opens any files.
5. **PERF-1 Direct JSONL Benchmark:** Verified 5,000 raw JSONL event aggregation executed in ~30ms with 100% accurate bucket counts and zero cross-tenant contamination.

---

## 6. Hardening & Operational Safety Verification (LOGHUB-QUERY-007)

As of LOGHUB-QUERY-007, `apps/query-service` contains **201 automated tests across 34 suites** (100% passing, 0 failing, 0 skipped), up from 194 tests in QUERY-006.

### 6.1 New Targeted Integration Suites

| Suite File | Tests | Focus Area |
| :--- | :--- | :--- |
| `tests/integration/stable-locator-duplicate-pagination.test.ts` | 3 | **P0-D:** Stable event identity and pagination over byte-identical duplicates (identical `@timestamp`, `event.id`, and JSON payload) within the same segment. Verified gapless pagination across multiple pages (P0-D1), parity between JSONL and Parquet (P0-D2), and seamless cross-format cursor continuity from JSONL to Parquet (P0-D3). |
| `tests/integration/tenant-fairness-cancellation.test.ts` | 4 | **P0-G:** Multi-tenant fairness, queue eviction on `AbortSignal`, slot release on execution timeout via `conn.interrupt()`, and bounded queue rejection HTTP 429 (`QueryBudgetExceededException`). |

### 6.2 Full Monorepo Active Test Suite Reconciliation
- `@skyra/query-service`: 201 tests across 34 suites (100% passing).
- `@skyra/contracts`: 45 tests across 4 suites (100% passing).
- `@skyra/ingestion-gateway`: 120 tests across 18 suites (100% passing).
- **Total Monorepo Active Suite:** **366 tests passing** (0 failed, 0 skipped).

