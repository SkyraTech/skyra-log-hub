# Skyra LogHub — Ingestion Failure & Recovery Matrix

**Document ID:** `LOGHUB-DOC-ING-007`  
**Task Reference:** `LOGHUB-ING-001A`  
**Phase:** Phase 2 (Centralized Ingestion)  
**Status:** Architecture Specification & Baseline  
**Architecture Reference:** ADR-011, ADR-013, ADR-015, ADR-016

---

## 1. Overview

This matrix establishes the definitive operational behavior of Skyra LogHub during hardware, software, network, and storage failure modes. For every fault, the matrix explicitly specifies commit status, client acknowledgement state, retry guidance, duplication risk, data reconstructibility, shipper spool deletion safety, and required operator remediation.

---

## 2. Failure Recovery Matrix

| Fault Scenario | Batch Committed? | Client Received Ack? | Client Should Retry? | Can Duplicates Occur? | Can Batch Be Reconstructed? | Can Shipper Delete Spool? | Operator Action Required |
|---|---|---|---|---|---|---|---|
| **Crash mid-record write** | No | No (Connection reset) | Yes (Immediate or backoff) | No | Yes (From client spool) | **NO** (Must retain spool) | None. WAL recovery truncates incomplete record automatically. |
| **Crash mid-batch serialization** | No | No (Connection reset) | Yes (Backoff) | No | Yes (From client spool) | **NO** | None. In-memory state cleared on crash. |
| **Crash before fsync completes** | No | No (Connection reset) | Yes (Backoff) | No | Yes (From client spool) | **NO** | None. Un-fsynced OS page cache discarded by kernel reboot. |
| **Crash AFTER fsync, BEFORE HTTP Ack sent** | **YES** (In journal WAL) | No (Client timeout or connection drop) | **YES** (Mandatory retry) | **NO** (Deduplicated via `batch_id`) | Yes (Already committed in WAL) | **NO** (Until retry receives `200 OK`) | None. Gateway acknowledges retry with `duplicate: true`. |
| **Network timeout / response loss after commit** | **YES** (In journal WAL) | No (Client-side timeout) | **YES** (Mandatory retry) | **NO** (Deduplicated via `batch_id`) | Yes (Already committed in WAL) | **NO** (Until retry receives `200 OK`) | None. Normal idempotency workflow. |
| **Gateway restart with partial tail in WAL** | Partial (Tail was uncommitted) | No (Tail never acked) | Yes (Client retries unacked batch) | No | Yes (From client spool) | **NO** | None. Recovery scanner truncates corrupt trailing tail to last valid commit boundary. |
| **CRC32C / framing corruption in MIDDLE of WAL** | **Committed downstream frames exist** | Previous acked / unacked | Yes | No | **YES** (Via WAL scan + Archive reconciliation) | **NO** | **CRITICAL**: Do NOT truncate! Downstream committed data is preserved. Gateway enters recovery-required state, emitting HTTP 503 `STORAGE_NOT_READY` until reconciled. |
| **Disk space exhausted (`ENOSPC`)** | No | No (`HTTP 503 STORAGE_NOT_READY`) | Yes (Exponential backoff) | No | Yes (From client spool) | **NO** | **YES**: Expand disk volume or purge old archive files. |
| **Journal volume unrecoverable (Hardware failure)** | Lost (If not yet archived) | Assumed previously acked | No (Client likely already deleted) | Possible | Only if offsite backup or client retains spool | N/A | **YES**: Restore from physical replica / backup. Replace drive. |
| **Archive segment write failure (Disk error)** | **YES** (Safe in WAL) | Yes (Client already received ack) | No (Client completed delivery) | No | **YES** (Replay from WAL to new archive path) | **YES** (Already durably committed in WAL) | **YES**: Check disk health. Trigger WAL replay to alternate path. |
| **PostgreSQL metadata write failure** | **YES** (Safe in WAL) | Yes (`durably_accepted` issued) | No | No | **YES** (WAL contains all metadata) | **YES** | **YES**: Restore PostgreSQL. Run `skyra-wal-reconcile` tool. |
| **Segment manifest write failure** | **YES** (In segment & WAL) | Yes | No | No | **YES** (Re-hash segment file) | **YES** | None. Archiver regenerates manifest from finalized segment. |
| **Valkey cache outage / node crash** | **YES** | Yes | No | No | Yes | **YES** | None. Gateway falls back to PostgreSQL receipt index automatically. |
| **Valkey flushed (`FLUSHALL`)** | **YES** | Yes | No | No | Yes | **YES** | None. Cache is lazily repopulated on misses. Zero data impact. |

---

## 3. Shipper Spool Deletion Safety Rules

A client log shipper (e.g. `@skyra/logger-node`, Python shipper, or agent) must follow strict criteria before deleting or advancing its local spool:

1. **Rule 1 (The Durable Receipt Rule):** A shipper may safely delete a spooled log file or advance its checkpoint watermark **if and only if** the gateway returns an HTTP 200 response with:
   - `status: "durably_accepted"`
   - A non-empty `receipt.receipt_id`
   - A valid `receipt.committed_at` timestamp
2. **Rule 2 (Ambiguous Outcome Retry):** On any network timeout, HTTP 500, HTTP 502, HTTP 503, or connection reset, the shipper **must never delete** its local spool. It must retain the events and retry using jittered exponential backoff with the exact same `batch_id`.
3. **Rule 3 (Permanent Rejection Handling):** On HTTP 400, 401, 403, 413, or 422, the batch cannot be processed by the gateway without code or configuration changes. The shipper must quarantine the failing batch to an error spool (preventing queue blockage) and alert system operators.
