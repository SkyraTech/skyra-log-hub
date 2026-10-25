# Skyra LogHub — Centralized Ingestion Architecture (v1)

**Document ID:** `LOGHUB-DOC-ING-001`  
**Task Reference:** `LOGHUB-ING-001A`  
**Phase:** Phase 2 (Centralized Ingestion)  
**Status:** Architecture Specification & Baseline  
**Architecture Reference:** ADR-001, ADR-004, ADR-011, ADR-012, ADR-013, ADR-014, ADR-015, ADR-016

---

## 1. Executive Summary & Design Principles

Skyra LogHub implements a **file-first, crash-recoverable centralized logging platform** designed for strict enterprise tenancy, high ingestion throughput, deterministic replay, and cost-effective analytics without requiring heavy message bus or distributed search infrastructure (no Kafka, no Elasticsearch, and no mandatory Valkey).

### Core Architectural Invariants:
1. **File-First Truth:** Immutable, partitioned JSON Lines (`.jsonl`) segments accompanied by cryptographic manifests (`.manifest.json`) constitute the authoritative, permanent record of telemetry.
2. **Crash-Recoverable Journal (WAL):** Ingestion acknowledgements are issued **only** after log events are committed and fsynced to an append-only write-ahead journal. In-memory buffering without fsync cannot issue durable success acknowledgements.
3. **Atomic All-or-Nothing Batch Acceptance:** Every submitted batch is validated and committed as an atomic unit. If any event violates Canonical Schema v1, tenant boundaries, or payload constraints, the entire batch is rejected. HTTP 207 Multi-Status is strictly prohibited in MVP.
4. **Authoritative, Cache-Independent Deduplication:** Deduplication and idempotency rely on journal-backed commit state and persistent receipt indexes. Valkey/Redis is strictly an optional, non-authoritative performance accelerator. The system remains completely safe and correct during cache eviction, flushing, or total cache outage.
5. **Strict Tenant & Project Isolation:** All directory layouts, ingestion authentication, query scoping, and deduplication namespaces are bound to cryptographically verified tenant and project identities. No client-supplied unverified paths or IDs are trusted.
6. **Zero Browser Ingestion Secrets:** Browser, Angular, and React SDKs transmit telemetry exclusively via trusted same-origin application backend proxies. Browser bundles never contain direct ingestion credentials.
7. **PostgreSQL Restricted to Metadata:** PostgreSQL is utilized exclusively for relational operational metadata (projects, services, credentials, segment catalogs, and rebuildable receipt indexes). Raw log events are never inserted as database rows.

---

## 2. End-to-End System Topology

```
+----------------------------------------------------------------------------------------------------+
|                                      INGESTION SOURCES                                             |
+----------------------------------------------------------------------------------------------------+
|  [Server Apps: Node, NestJS, Python]       [Serverless: Next.js]       [Browser, Angular, React]   |
|         |                                            |                              |              |
|         v (Local Spool Files)                        |                              v (Same-Origin)|
|   [Local JSONL Spool]                                |                     [App Backend Proxy]     |
|   (Exclusive Single-Writer)                          |                     (Auth, CSRF, Rate-Limit)|
|         |                                            |                              |              |
|         v (Follow / Ship)                            |                              |              |
|   [LogHub Shipper Agent]                             v (Direct HTTPS Export)        v (Server-to-S)|
+---------+--------------------------------------------+------------------------------+--------------+
          |                                            |                              |
          +--------------------------------------------+------------------------------+
                                                       |
                                                       v
                       +---------------------------------------------------------------+
                       |           SKYRA LOGHUB INGESTION GATEWAY (NestJS/Fastify)     |
                       +---------------------------------------------------------------+
                       | 1. Transport TLS Termination & Rate Limiting                  |
                       | 2. Scoped Credential Authentication (Bearer Token)            |
                       | 3. Tenant & Project Context Resolution                        |
                       | 4. Batch Envelope Validation (Authoritative v1 & Legacy)      |
                       | 5. Canonical Event Schema v1 Validation (Ajv 2020)             |
                       | 6. Payload Digest (SHA-256) & Deduplication Lookup            |
                       | 7. Atomic Write-Ahead Journal Framing                         |
                       +-------------------------------+-------------------------------+
                                                       |
                                                       v (Atomic Append & fsync)
                       +---------------------------------------------------------------+
                       |          DURABLE WRITE-AHEAD JOURNAL (Local NVMe / SSD)       |
                       +---------------------------------------------------------------+
                       | - Sequential Binary Batch Framing                             |
                       | - CRC32C Frame Checksum + SHA-256 Digest                      |
                       | - Synchronous fsync Barrier (File + Parent Directory)         |
                       +-------------------------------+-------------------------------+
                                                       |
                                                       v (Durable Ack Returned to Client)
                                             [HTTP 200 OK: durably_accepted]
                                                       |
                                                       v (Asynchronous Background Pipeline)
                       +---------------------------------------------------------------+
                       |            ARCHIVE WRITER & RECONCILIATION WORKER             |
                       +---------------------------------------------------------------+
                       | 1. Sequential Journal Tail Replay                             |
                       | 2. Partition by ${TENANT}/${PROJECT}/${ENV}/${SERVICE}/${DATE}|
                       | 3. Append to Active Segment (segment-${PART_INDEX}.jsonl)     |
                       | 4. Size / Midnight Rollover & fsync Finalization              |
                       | 5. Cryptographic SHA-256 Checksum Calculation                 |
                       | 6. Generate segment-${PART_INDEX}.manifest.json               |
                       | 7. Update PostgreSQL Ingestion Catalog & Checkpoints          |
                       | 8. Truncate / Reclaim Fully Replayed Journal Segments         |
                       +-------------------------------+-------------------------------+
                                                       |
                                                       v
                       +---------------------------------------------------------------+
                       |       CENTRAL IMMUTABLE ARCHIVE (Local / S3 / Azure / MinIO)  |
                       +---------------------------------------------------------------+
                       | - Read-Only JSONL Segments (Canonical ECS 8.11.0)             |
                       | - Cryptographic Manifest Files                                |
                       | - Source of Truth for Compaction (Parquet) & DuckDB Queries   |
                       +---------------------------------------------------------------+
```

---

## 3. Core Subsystem Responsibilities

### 3.1 Ingestion Gateway (NestJS + Fastify)
- **High-Throughput HTTP Engine:** Utilizes Fastify adapter with bounded body parsing (max 5 MiB uncompressed, max 500 events per batch).
- **Security Boundary:** Validates incoming machine Bearer tokens against cached PostgreSQL credentials. Resolves authorized tenant, project, and environment scopes.
- **Validation Engine:** Strict schema validation using cached Ajv 2020 engine. Validates RFC 4122 UUIDv4 event IDs, RFC 3339 UTC timestamps, leap-year boundaries, and ECS 8.11.0 canonical structure.
- **Journal Commit Dispatcher:** Acquires batch framing, commits to the local active journal segment, triggers fsync, records receipt in the local index, and returns `durably_accepted` HTTP 200 OK response.
- **Readiness Reporter:** Exposes `/health/live` and `/health/ready`. `/health/ready` reports HTTP 503 if journal storage is unavailable, preventing misrouting of traffic.

### 3.2 Write-Ahead Journal (WAL Engine)
- **Crash Durability:** Appends framed batch records to contiguous, pre-allocated journal files.
- **Integrity Framing:** Each journal frame contains: Magic Byte (`0x534B5952`), Protocol Version (`1`), Frame Length, Batch ID, Tenant ID, Project ID, Event Count, SHA-256 Content Digest, Payload Bytes, and CRC32C Checksum.
- **Crash Recovery:** On restart, scans the active journal segment from offset 0. Uncorrupted complete records are validated; partial tail writes (from mid-record crash) are truncated; committed records are fed into the archive pipeline.

### 3.3 Archive Writer & Reconciler
- **Single-Writer Partitioning:** Distributes events from the journal into tenant-scoped, project-scoped, daily partitioned directory structures.
- **Segment Finalization:** Rotates segments at 100 MiB or UTC midnight. Computes SHA-256 hash across all bytes in `segment-${PART_INDEX}.jsonl`, writes `segment-${PART_INDEX}.manifest.json`, and executes `fsync` on both the segment, manifest, and parent directory.
- **Journal Segment Reclaim:** Deletes or archives old journal segments only after all contained batches are verified present in finalized archive segments and recorded in PostgreSQL metadata.

### 3.4 Operational Metadata & Receipt Index (PostgreSQL)
- **Role:** Stores credentials, project registrations, archive segment catalogs, ingestion checkpoints, and durable receipt lookups.
- **Rebuildability:** The PostgreSQL receipt index and segment catalog are fully reconstructible by scanning the journal and archive manifests. A database failure does not compromise raw telemetry integrity.

### 3.5 Optional Acceleration Cache (Valkey / Redis)
- **Role:** Transient rate-limiting counters and ephemeral 24-hour deduplication cache for sub-millisecond replay lookups.
- **Non-Authoritative:** If Valkey is unavailable, evicted, flushed, or restarting, the gateway seamlessly falls back to the journal-backed receipt index.

---

## 4. Key Architectural Boundaries & Interfaces

| Component Interface | Protocol / Format | Durability Guarantee | Authority |
|---|---|---|---|
| Browser -> App Backend Proxy | HTTPS / Same-Origin JSON | None (Ephemeral in browser) | Client Application Session |
| App Backend -> Gateway | HTTPS / JSON Batch (`POST /ingest/v1/logs`) | Synchronous Journal fsync | Machine Bearer Token |
| Shipper -> Gateway | HTTPS / JSON Batch (`POST /ingest/v1/logs`) | Synchronous Journal fsync | Machine Bearer Token |
| Gateway -> Journal (WAL) | Local POSIX `write()` + `fsync()` | Hardware fsync barrier | Authoritative Ingestion WAL |
| Journal -> Archive Writer | Local Stream / In-Order Replay | Checkpointed WAL offset | WAL Ground Truth |
| Archive Writer -> Central Archive | Sequential JSONL + Manifest (`fsync`) | Read-Only Immutable Storage | Authoritative Permanent Telemetry |
| Gateway / Worker -> PostgreSQL | TCP / Prisma SQL Transactions | ACID Metadata Storage | Operational Index (Rebuildable) |
| Gateway -> Valkey | TCP / RESP3 | Volatile In-Memory | Optimization Cache Only |

---

## 5. Architectural Quality Attributes

1. **Reliability (RPO = 0 for Accepted Batches):** Any batch acknowledged with `durably_accepted` is guaranteed to exist on non-volatile physical storage across host reboots and sudden power loss.
2. **Availability:** Gateway readiness is strictly coupled to durability capability. If physical disk storage fills or journal files become unwritable, the gateway sheds load with HTTP 503 and `Retry-After`, preventing silent data loss.
3. **Auditability:** Every finalized segment has a companion cryptographically signed manifest containing byte counts, SHA-256 hashes, timestamp ranges, and writer instance signatures.
4. **Maintainability:** Minimal infrastructure dependencies. Operable on bare-metal servers, containerized environments, or cloud VMs with attached persistent block volumes.
