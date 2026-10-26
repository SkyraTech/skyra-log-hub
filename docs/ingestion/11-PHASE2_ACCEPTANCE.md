# Phase 2 Acceptance & Release Readiness Specification

> **Product:** Skyra LogHub  
> **Phase:** Phase 2 — Centralized Ingestion Acceptance  
> **Task ID:** `LOGHUB-ING-006`  
> **Status:** APPROVED & CERTIFIED (Phase 2 Functional Acceptance)  
> **Date:** 2026-10-25  
> **Scope:** Multi-SDK Logging, Reliable Shipper, Central Fastify Ingestion Gateway, Binary WAL with fsync, PostgreSQL Metadata Repositories, Central Immutable JSONL Archive, and Crash Recovery.

---

## 1. Verified Ingestion Architecture

The complete end-to-end data pipeline was verified across all physical layers:

```text
Application Space
┌────────────────────────────────────────────────────────┐
│  Skyra Logging SDK (Node.js / Python / Browser)       │
│  - Canonical Event Construction (ECS 8.11.0 / UUIDv4)   │
│  - Deep Sensitive Key Redaction (Circular-safe)         │
│  - Bounded Local Memory / Priority Queue                │
└───────────────────────────┬────────────────────────────┘
                            │
               ┌────────────┴────────────┐
               │                         │ (Browser HTTP)
        (File Spool)                     v
               │            ┌────────────────────────────┐
               v            │ Same-Origin Trusted Proxy  │
┌─────────────────────────┐ │ - Strips client headers    │
│ UTC Daily JSONL Spool   │ │ - Injects Bearer Token     │
│ Monotonic Part Files    │ │ - Enforces Project Scope   │
└──────────────┬──────────┘ └────────────┬───────────────┘
               │                         │
               v                         │
┌─────────────────────────┐              │
│ Standalone Log Shipper  │              │
│ - Spool Discovery       │              │
│ - Checkpoint Manager    │              │
│ - Corrupt Quarantine    │              │
│ - Atomic Batch Builder  │              │
└──────────────┬──────────┘              │
               │ (Authenticated HTTP)    │
               └────────────┬────────────┘
                            v
Ingestion Gateway Space
┌────────────────────────────────────────────────────────┐
│ NestJS / Fastify Ingestion Gateway                     │
│ 1. Scoped Bearer Authentication & Project Authorization │
│ 2. Canonical Ajv Schema Validation & Atomic Admission  │
│ 3. Per-Batch Concurrency Lock (DeduplicationLockService)│
│ 4. 7-Day Bounded Idempotency Check (PostgreSQL/Cache)  │
│ 5. Physical Binary Write-Ahead Journal (WAL) + fsync   │
│ 6. Durable Receipt Registration (PostgreSQL Repos)    │
│ 7. Synchronous Central Immutable JSONL Archival        │
│ 8. JSONL Segment Manifests (.manifest.json) + fsync    │
└────────────────────────────────────────────────────────┘
```

---

## 2. Actual Supported Runtime Topology

### 2.1 Single-Writer Active Ownership Domain (MVP Certified)
- **Certification Boundary:** Skyra LogHub Phase 2 MVP supports **one active gateway writer instance per journal/archive storage domain**.
- **Mutual Exclusion Enforcement:** Guarded via `.journal.owner` file with atomic creation (`O_CREAT | O_EXCL`), holding instance UUID, system PID, hostname, and UTC lease timestamp.
- **Fail-Closed Guarantee:** Any second gateway process targeting the same journal root directory is immediately blocked during bootstrap with `StorageOwnershipConflictError` and fails its health readiness probe (`/health/ready` returns 503).
- **Stale Lock Recovery:** If an ungracefully terminated process leaves a stale ownership lock, recovery verifies whether the recorded PID is dead via `process.kill(pid, 0)`. Only upon verified death is the stale lock purged and cleanly reclaimed.
- **Explicit Exclusion:** Multi-host active-active concurrent writers on a shared network filesystem (NFS/SMB) are **NOT** certified for Phase 2. High availability must be achieved via active-passive failover with strict fencing.

---

## 3. Evidence Matrix

| Component | Tested Invariant | Verification Method | Result |
|---|---|---|---|
| **Node.js SDK** | Canonical event generation, UTC rotation, size rollover, quarantine recovery, deep redaction | 46 automated tests (`packages/logger-node/tests`), isolated consumer test | **PASS** |
| **Python SDK** | Python standard library integration, calendar leap-year bounds, crash recovery, stdlib handler | 78 automated tests (`packages/logger-python/tests`), isolated wheel consumer | **PASS** |
| **Browser SDK** | Canonical schema compliance, beacon fallback, navigation tracking, zero Node.js deps | 40 automated tests, real headless Edge 156 browser CDP automation | **PASS** |
| **NestJS Adapter** | Automatic route observability, W3C traceparent propagation, AsyncLocalStorage context | 46 automated tests (`packages/logger-nestjs/tests`) | **PASS** |
| **Next.js Adapter** | Route handler wrapping, Server Actions, RSC telemetry, Edge runtime fallback | 47 automated tests (`packages/logger-next/tests`) including production App Router build | **PASS** |
| **Framework Adapters** | Angular standalone provider (8 tests) and React Provider/ErrorBoundary (6 tests) | 14 automated tests (`packages/logger-angular`, `packages/logger-react`) | **PASS** |
| **Log Shipper** | Spool discovery, atomic checkpointing, quarantine of bad lines, retry idempotency | 21 automated integration and physical E2E tests (`apps/log-shipper/tests`) | **PASS** |
| **Ingestion Gateway** | Fastify HTTP pipeline, rate limiting, duplicate key rejection, scoped auth | 37 Fastify HTTP and live PostgreSQL integration tests | **PASS** |
| **Binary WAL** | CRC32C framing, torn-tail truncation, mid-file corruption detection, fsync durability | 31 unit, crash recovery, and subprocess termination tests | **PASS** |
| **PostgreSQL Repos** | Scoped credentials, tenant isolation, receipts, archive segments, checkpoints | 21 live tests on PostgreSQL 17 (`skyra_loghub_dev`) | **PASS** |
| **Central Archive** | Bounded segment rollover, SHA-256 manifests, read-only permissions, watermark range | 21 archive writer tests, Scenario 12 recovery tests | **PASS** |
| **Idempotency** | Exact 7-day deduplication window, legacy browser synthetic batch IDs, concurrency lock | 23 twelve-scenarios failure tests, 100 concurrent submissions test | **PASS** |

---

## 4. Accepted Limitations

1. **Seven-Day Bounded Deduplication Horizon:**
   - Gateway deduplication memory is authoritative for 7 calendar days (`SEVEN_DAYS_MS = 604,800,000 ms`).
   - Retries submitted beyond 7 days after initial commit are lawfully treated as new batches and admitted.
2. **Single Active Writer Per Storage Domain:**
   - Multi-master write concurrency to the same physical journal or archive directory is forbidden.
   - Clustering requires partition sharding by Tenant ID or active-passive standby topology.
3. **Local Spool Buffering Limits:**
   - When the ingestion gateway is offline, local SDK spools buffer on disk until local storage limits or disk quotas are reached. Shipper implements exponential backoff with jitter and does not advance checkpoints or delete spool files until durable receipts are acknowledged.
4. **Browser Same-Origin Requirement:**
   - The Browser SDK must never be configured with direct ingestion gateway machine credentials. Ingestion must proceed through a trusted same-origin backend proxy.

---

## 5. Operational Prerequisites

1. **Node.js Runtime:** Node.js v20.0.0+ (Tested on v24.21.0).
2. **Python Runtime:** Python 3.10+ (Tested on v3.13.5 with `jsonschema>=4.20.0`).
3. **PostgreSQL Database:** Dedicated database `skyra_loghub_dev` on local or remote PostgreSQL 15+ with migration `20261024000000_init_metadata` applied.
4. **Dedicated Non-Root User:** Non-superuser role `skyra_loghub_user` with restricted table grants.
5. **Storage Subsystem:** Local SSD or low-latency block storage supporting POSIX/Windows synchronous `fsync` barriers.

---

## 6. Known Risks & Mitigation

| Risk ID | Description | Impact | Mitigation Status |
|---|---|---|---|
| **RISK-01** | Gateway crash after WAL append but before DB receipt write | Transient desync between WAL and PostgreSQL | **MITIGATED:** Startup recovery scans active WAL segment, detects uncommitted receipts, and reconciles them into PostgreSQL before accepting traffic. |
| **RISK-02** | Network failure after gateway commit before shipper receives HTTP response | Shipper replays duplicate batch | **MITIGATED:** Gateway detects content digest match, returns HTTP 200 with `duplicate: true`, and repeats original durable receipt without double-appending to WAL or Archive. |
| **RISK-03** | Mid-file disk corruption in WAL journal | Corrupted frame invalidates downstream log stream | **MITIGATED:** WAL framing validates CRC32C checksums; mid-file corruption preserves downstream committed frames and flags `recovery_required=true` for operator inspection. |
| **RISK-04** | Disk full during log shipping | Spool accumulation and queue drops | **MITIGATED:** Shipper honors disk backoff; logger SDK drops non-critical logs while preserving error/fatal logs through emergency direct bypass. |

---

## 7. Phase 3 Dependencies & Exclusions

### Unblocked for Phase 3:
- `LOGHUB-QUERY-001`: Query Architecture & Contracts.
- Central Archive JSONL indexing, Parquet conversion, and DuckDB analytical query engine.
- Developer search interface and Angular dashboard foundation.

### Explicit Exclusions (Not Certified in Phase 2):
- Multi-host active-active distributed ingestion clustering.
- High-concurrency query execution engine (Phase 3).
- Real-time alerting or anomaly detection (Phase 5).
- Angular dashboard UI implementation (Phase 4).
- Production deployment rollout and public package publishing (Phase 7).

---

## 8. Final Verdict

**VERDICT: PASS — Phase 2 Functional Acceptance**  
All functional, security, reliability, durability, and data-integrity acceptance criteria for Phase 2 are verified with concrete test and benchmark evidence.
