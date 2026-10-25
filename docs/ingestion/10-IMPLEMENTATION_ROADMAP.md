# Skyra LogHub — Ingestion Implementation Roadmap & Gates

**Document ID:** `LOGHUB-DOC-ING-010`  
**Task Reference:** `LOGHUB-ING-001A`  
**Phase:** Phase 2 (Centralized Ingestion)  
**Status:** Implementation Roadmap & Gating Baseline  
**Architecture Reference:** ADR-011, ADR-012, ADR-013, ADR-014, ADR-015, ADR-016

---

## 1. Revised Phase 2 Phased Delivery Sequence

Phase 2 replaces the legacy LH-201..205 placeholder tasks with a strictly gated, dependency-hardened implementation plan:

```
+-------------------------------------------------------------------------+
| LOGHUB-ING-001A: Architectural Corrections & Contract Gate (CURRENT)    |
| - Resolves Valkey non-authoritative deduplication blocker               |
| - Establishes atomic all-or-nothing batch contract                      |
| - Defines browser same-origin backend proxy trust boundary              |
| - Authors machine-readable contracts & 20 offline verification tests    |
+-------------------------------------------------------------------------+
                                     |
                                     v [GATE 1: Architecture Review Approval]
+-------------------------------------------------------------------------+
| LOGHUB-ING-002: Secure Gateway Foundation (COMPLETED)                   |
| - NestJS + Fastify runtime shell (apps/ingestion-gateway)               |
| - Authentication middleware (Bearer token) & tenant/project mapper      |
| - Canonical Schema v1 validator & recursive duplicate-key check         |
| - Liveness (/health/live = 200) & Readiness (/health/ready = 503)       |
| - HARD CONSTRAINT VERIFIED: Ingestion returns 503 STORAGE_NOT_READY     |
| - 47 automated tests passing; 29,877 events/sec admission benchmark     |
+-------------------------------------------------------------------------+
                                     |
                                     v [GATE 2: Gateway Foundation Verification — PASSED]
+-------------------------------------------------------------------------+
| LOGHUB-ING-003: Durable Journal & Archive Writer (NEXT)                 |
| - Sequential Write-Ahead Journal (WAL) with CRC32C framing              |
| - Synchronous fsync barrier (file descriptor + parent directory)        |
| - Minimal durable receipt generation & recovery scanner                 |
| - Segment writer with 100MB/midnight rotation & manifest generator      |
| - Ingestion routes enabled; readiness reports operational               |
+-------------------------------------------------------------------------+
                                     |
                                     v [GATE 3: Durability & Recovery Verification]
+-------------------------------------------------------------------------+
| LOGHUB-ING-004: Idempotency & Replay Hardening                          |
| - Concurrency-safe deduplication locking (PostgreSQL + local WAL index) |
| - Optional Valkey replay cache integration (24-hour read-through)       |
| - 7-day retention horizon automated pruning                             |
| - Exhaustive 12-scenario failure recovery test suite                    |
+-------------------------------------------------------------------------+
                                     |
                                     v [GATE 4: Replay & Concurrency Certification]
+-------------------------------------------------------------------------+
| LOGHUB-ING-005: Local Shipper & Cross-SDK E2E                           |
| - Local spool follower/shipper for Node.js and Python                   |
| - Checkpoint watermark persistence & retry exponential backoff          |
| - Durable receipt verification before spool deletion                    |
| - End-to-end integration across all 8 SDK adapters                      |
+-------------------------------------------------------------------------+
```

---

## 2. Detailed Task Definitions & Gating Criteria

### Task LOGHUB-ING-002: Secure Gateway Foundation
- **Goal:** Implement the hardened HTTP ingress service, authentication, and validation boundary.
- **Dependencies:** `LOGHUB-ING-001A` sign-off.
- **Key Deliverables:**
  - Fastify NestJS application module (`apps/ingestion-gateway`).
  - Bearer token authentication guard with PostgreSQL credential lookup and in-memory cache.
  - Project/tenant authorization validator.
  - Schema validation pipe rejecting malformed JSON, duplicate keys, or invalid canonical fields.
  - Separate health probes: `/health/live` returns 200; `/health/ready` returns 503 until durability engine is attached.
- **Hard Safety Constraint:** The gateway **must not** return `200 OK` or `durably_accepted` for `/ingest/v1/logs`. Ingestion requests must return `HTTP 503 STORAGE_NOT_READY` (`retryable: true`) until the storage engine in `ING-003` is functional.

### Task LOGHUB-ING-003: Durable Journal & Archive Writer
- **Goal:** Implement physical crash-recoverable WAL persistence, fsync boundary, and archive segment finalization.
- **Dependencies:** `LOGHUB-ING-002`.
- **Key Deliverables:**
  - WAL manager with binary framing, length prefixing, CRC32C checksums, and synchronous `fsync()`.
  - Minimal durable receipt recording in local WAL index.
  - Startup crash-recovery scanner that validates frames and truncates torn/partial tail writes.
  - Archive writer service partitioning events into `${ARCHIVE_ROOT}/${TENANT}/${PROJECT}/${ENV}/${SERVICE}/${DATE}/`.
  - Automatic rollover at 100 MiB or UTC midnight, SHA-256 calculation, and `segment-${PART}.manifest.json` generation.
  - Readiness probe hooked to storage health: `/health/ready` returns 200 when WAL volume is mounted and writable.

### Task LOGHUB-ING-004: Idempotency & Replay Hardening
- **Goal:** Implement concurrency-safe duplicate prevention, journal-backed receipt reconciliation, and retention pruning.
- **Dependencies:** `LOGHUB-ING-003`.
- **Key Deliverables:**
  - High-concurrency deduplication locking across gateway workers.
  - PostgreSQL `deduplication_receipts` table sync and 7-day retention cron.
  - Optional Valkey read-through caching for sub-millisecond duplicate checks.
  - Automated failure test harness reproducing all 12 failure scenarios (simulating power cuts, mid-record crashes, and Valkey outages).

### Task LOGHUB-ING-005: Local Shipper & Cross-SDK E2E
- **Goal:** Implement client-side log spool shipping, checkpoint tracking, and durable acknowledgement receipt processing.
- **Dependencies:** `LOGHUB-ING-004`.
- **Key Deliverables:**
  - Shipper daemon tailing active and rotated `.jsonl` files from `logger-node` and `logger-python`.
  - Watermark tracking: advancing read offsets and safely deleting rotated spools **only** after receiving `durably_accepted` receipts.
  - Next.js serverless direct export adapter.
  - Cross-SDK end-to-end verification without modifying `skyra-e2e-suite`.
