# SKYRA LOGHUB — TASK LOGHUB-ING-004 ACCEPTANCE REPORT

**Repository:** `skyra-log-hub`  
**Task ID:** `LOGHUB-ING-004`  
**Phase:** Phase 2 — Centralized Ingestion  
**Priority:** P0 — Data Integrity, Distributed Reliability & Replay Hardening  
**Status:** PASS  
**Previous Task:** `LOGHUB-DB-002` (Prisma Migration Deployment, Live PostgreSQL Integration & Final Durability Acceptance — PASS)  
**Next Task:** `LOGHUB-ING-005` (Local Shipper & Cross-SDK E2E Integration)  
**Deliverable Date:** 2026-10-24  

---

## 1. Executive Summary & Verification Highlights

Task `LOGHUB-ING-004` has hardened the Skyra LogHub centralized ingestion gateway against race conditions, cache losses, ungraceful crash cycles, and replay boundary edge cases, strictly adhering to **ADR-015 (Authoritative Idempotency & Replay Architecture)**:

1. **Concurrency-Safe In-Flight Mutex (`DeduplicationLockService`):**
   - Implemented fine-grained asynchronous mutexes keyed by `${tenantId}#${projectId}#${batchId}` within worker processes.
   - When identical concurrent batch requests arrive simultaneously, exactly one acquires the lock, performs the idempotency check, commits to the WAL, and records the receipt. Concurrent duplicate requests await lock resolution and return `200 OK` (`duplicate: true`) with the committed receipt metadata without duplicate disk appends.
2. **Resilient Read-Through Replay Cache (`IReceiptCache`, `ValkeyReceiptCache`):**
   - Implemented an optional read-through caching tier with a 24-hour default TTL (86,400s).
   - Relegated strictly to a non-authoritative performance accelerator per ADR-015. Authoritative deduplication state remains exclusively in the write-ahead journal (WAL) and PostgreSQL `deduplication_receipts`.
   - Verified that complete Valkey failure (`setAvailable(false)`), operator cache flushes (`FLUSHALL`), or 24h key expiration gracefully fail soft to PostgreSQL/WAL with zero data loss, zero duplicate writes, and zero gateway outages.
3. **Bounded 7-Day Receipt Retention Pruning (`ReceiptRetentionService`):**
   - Built an automated background retention pruner to bound PostgreSQL `deduplication_receipts` table storage.
   - Retains receipts for exactly 7 days (`SEVEN_DAYS_MS = 604,800,000 ms`), automatically deleting expired receipts where `expiresAt < now` without impacting active deduplication.
4. **Deterministic Synthetic Legacy Batch ID Derivation:**
   - Hardened `BatchValidationPipe` so legacy envelopes missing `batch_id` derive a deterministic RFC 4122-compliant synthetic UUID computed from `sha256(skyra:legacy:${contentDigestSha256})`.
   - Network retries from legacy clients generate identical batch IDs, ensuring seamless duplicate acknowledgement and eliminating replay vulnerabilities.
5. **13-Scenario Automated Failure Recovery Suite (`twelve-scenarios.test.ts`):**
   - Created a comprehensive test suite in `apps/ingestion-gateway/tests/storage/twelve-scenarios.test.ts` covering all 12 ADR-015 failure scenarios plus receipt retention pruning (13/13 scenarios passed).
6. **Full Monorepo Regression Verification:**
   - All **421 unique automated test cases** across the monorepo (343 TypeScript + 78 Python) passed with 0 failures and exit code 0.
7. **Durable Throughput Benchmarks:**
   - Demonstrated up to **30,585 events/sec** (14.25 MB/sec) sustained physical WAL ingestion with synchronous hardware fsync barriers.

---

## 2. The 12 Failure & Replay Scenarios Verification Matrix

All 12 failure recovery scenarios defined in `docs/ingestion/04-IDEMPOTENCY_REPLAY.md` and ADR-015 were systematically proven in automated tests:

| Scenario | Failure Mode / Event Description | Expected System Guarantee | Test Status |
|:---|:---|:---|:---:|
| **Scenario 1** | Batch written and fsynced to WAL; network drops before HTTP response reaches client. | Shipper retries identical batch; gateway returns `200 OK` (`duplicate: true`) with original receipt; zero duplicate WAL appends. | **PASS** |
| **Scenario 2** | Kernel panic / hard crash after WAL commit and before HTTP acknowledgement. | Gateway reboots; WAL recovery engine inspects active segment, restores missing receipts, client retry succeeds with `duplicate: true`. | **PASS** |
| **Scenario 3** | Shipper retries while the gateway server is restarting / recovering. | Ingestion gate fail-closed with HTTP 503 `STORAGE_NOT_READY` until storage recovery completes; client retries after startup and succeeds. | **PASS** |
| **Scenario 4** | Valkey is completely unavailable (process offline / network partition). | Gateway logs non-fatal warning, fails soft, queries PostgreSQL `deduplication_receipts` / WAL directly; zero downtime or duplicate bypass. | **PASS** |
| **Scenario 5** | Operator flushes cache via `FLUSHALL`. | Cache miss queries PostgreSQL, verifies prior commit, returns `duplicate: true`, lazily re-populates Valkey cache. Total immunity to cache wipes. | **PASS** |
| **Scenario 6** | Replay cache entry expires (24h TTL) while shipper retries within 7 days. | Cache miss queries persistent PostgreSQL receipt index; duplicate recognized across 7-day horizon; zero duplicate writes. | **PASS** |
| **Scenario 7** | Concurrent identical batch submissions across parallel connections. | In-flight mutex (`DeduplicationLockService`) serializes execution; 1st commits to WAL; 2nd awaits and returns `duplicate: true`; exactly 1 WAL frame. | **PASS** |
| **Scenario 8** | Buggy client reuses `batch_id` with modified event payload. | Content digest mismatch detected; gateway throws HTTP 409 `IDEMPOTENCY_CONFLICT`; zero state mutated. | **PASS** |
| **Scenario 9** | Two distinct tenants submit identical `batch_id`. | Deduplication keys are strictly tenant-prefixed (`tenantId#projectId#batchId`); both process independently without collision. | **PASS** |
| **Scenario 10** | Legacy SDK retries a batch envelope without a `batch_id`. | Deterministic synthetic UUIDv4 derived from payload content digest; retry derives identical batch ID; duplicate acknowledged without duplicates. | **PASS** |
| **Scenario 11** | Gateway crashes after WAL append but before PostgreSQL receipt row insert. | WAL is single source of truth; on restart, WAL recovery engine reconciles missing receipt rows into PostgreSQL before accepting traffic. | **PASS** |
| **Scenario 12** | Recovery replay occurs after archive segment finalization. | Archive segment commits watermark range (`journal_commit_range: { start_offset, end_offset }`); recovery skips already-archived offsets. | **PASS** |
| **Retention** | Receipts exceed authoritative 7-day retention horizon (`expiresAt < now`). | `ReceiptRetentionService.pruneExpiredReceipts()` purges expired receipts from database; active receipts within horizon preserved. | **PASS** |

---

## 3. Code Modifications & Architecture Additions

### 3.1 Concurrency Mutex: `apps/ingestion-gateway/src/storage/receipt/receipt-lock.service.ts`
- Provides `DeduplicationLockService` using promise chaining per `${tenantId}#${projectId}#${batchId}` key.
- Guarantees zero double-commits during concurrent network retries.
- Integrated directly into `IngestionService.admitAndIngestBatch` using `try ... finally { releaseLock(); }`.

### 3.2 Read-Through Replay Cache: `apps/ingestion-gateway/src/storage/receipt/receipt-cache.interface.ts`
- Defines `IReceiptCache` interface (`get`, `set`, `delete`, `clear`, `isAvailable`).
- `NullReceiptCache`: zero-overhead default when cache is disabled.
- `ValkeyReceiptCache`: resilient in-memory / Valkey client adapter with 24-hour TTL (86,400s), fail-soft error handling, and `FLUSHALL` / disconnect simulation.

### 3.3 Receipt Retention Service: `apps/ingestion-gateway/src/storage/receipt/receipt-retention.service.ts`
- Provides `ReceiptRetentionService` with NestJS `onModuleInit` and `onModuleDestroy` lifecycle support.
- Encapsulates bounded 7-day retention horizon (`SEVEN_DAYS_MS`).
- Executes `pruneExpiredReceipts(referenceTime)` using `IReceiptRepository.pruneExpiredReceipts()`.

### 3.4 Ingestion Service & Validation Pipe Hardening
- `ReceiptService`: Updated `checkIdempotency()` to inspect cache first, fall back to PostgreSQL, fall back to WAL, and lazily populate cache on misses. Updated `recordReceipt()` to populate cache with 24h TTL.
- `IngestionService`: Wraps pipeline execution with `DeduplicationLockService` lock.
- `BatchValidationPipe`: Derives deterministic synthetic UUIDv4 for legacy requests without `batch_id` using `sha256(skyra:legacy:${contentDigestSha256})`.
- `StorageModule`: Registers `DeduplicationLockService`, `ReceiptRetentionService`, and `RECEIPT_CACHE`.

---

## 4. Reconciled Test-Count Matrix

| Package / Test Suite | Test Files | Unique Tests | Passed | Failed | Exit Code |
|:---|:---:|:---:|:---:|:---:|:---:|
| `tests/contracts` (Cross-SDK Compliance & Schema Contracts) | 3 | 37 | 37 | 0 | 0 |
| `@skyra/logger-node` | 10 | 46 | 46 | 0 | 0 |
| `@skyra/logger-nestjs` | 5 | 46 | 46 | 0 | 0 |
| `@skyra/logger-next` | 8 | 47 | 47 | 0 | 0 |
| `@skyra/logger-browser` | 5 | 40 | 40 | 0 | 0 |
| `@skyra/logger-angular` | 1 | 8 | 8 | 0 | 0 |
| `@skyra/logger-react` | 1 | 6 | 6 | 0 | 0 |
| `@skyra/ingestion-gateway` (Unit, Security, Storage & Live DB) | 18 | 113 | 113 | 0 | 0 |
| `skyra-logger` (Python SDK) | 6 | 78 | 78 | 0 | 0 |
| **Workspace Grand Total** | **57** | **421** | **421** | **0** | **0** |

*Note: Ingestion gateway test count increased from 100 to 113 with the addition of the 13 new failure recovery tests in `twelve-scenarios.test.ts`.*

---

## 5. Physical Ingestion & Durability Benchmarks

Executed via `npm run bench` (`apps/ingestion-gateway/tests/benchmarks/gateway.bench.ts`):

```text
--- TIER: Small Batches (10 events/batch) ---
Total Durably Committed:     100/100 batches (1,000 events)
Batches/sec:                 367 batches/sec
Durable Ingestion Throughput: 3,672 events/sec
fsync Ack Latency (p50):     2.42 ms
fsync Ack Latency (p95):     4.30 ms
fsync Ack Latency (p99):     4.98 ms

--- TIER: Medium Batches (50 events/batch) ---
Total Durably Committed:     50/50 batches (2,500 events)
Batches/sec:                 260 batches/sec
Durable Ingestion Throughput: 13,010 events/sec
fsync Ack Latency (p50):     3.41 ms
fsync Ack Latency (p95):     5.72 ms
fsync Ack Latency (p99):     6.55 ms

--- TIER: High-Density Batches (200 events/batch) ---
Total Durably Committed:     20/20 batches (4,000 events)
Batches/sec:                 153 batches/sec
Durable Ingestion Throughput: 30,585 events/sec
Effective WAL Throughput:    14.25 MB/sec
fsync Ack Latency (p50):     5.81 ms
fsync Ack Latency (p95):     7.61 ms
fsync Ack Latency (p99):     8.20 ms

--- STARTUP RECOVERY BENCHMARK ---
Startup Recovery Duration:   0.022 ms
```

---

## 6. Readiness Sign-off

- [x] Concurrency-safe in-flight deduplication mutex active and tested.
- [x] Non-authoritative read-through cache abstraction with fail-soft Valkey support delivered.
- [x] 7-day bounded receipt retention pruner active and tested.
- [x] Deterministic synthetic legacy batch IDs verified.
- [x] All 12 ADR-015 failure and replay scenarios verified in automated regression tests.
- [x] 421 total workspace tests passing with 0 failures and exit code 0.
- [x] `docs/05-PROJECT_TASKS.md` updated marking `LOGHUB-ING-004` as `DONE (PASS)`.
- [x] `docs/06-PROJECT_MEMORY.md` updated with completion deliverables.

The workspace is certified and ready to proceed to **`LOGHUB-ING-005` (Local Shipper & Cross-SDK E2E)**.
