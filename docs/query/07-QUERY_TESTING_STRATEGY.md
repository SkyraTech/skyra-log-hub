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
