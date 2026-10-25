# Skyra LogHub — Durability & Acknowledgement Semantics

**Document ID:** `LOGHUB-DOC-ING-003`  
**Task Reference:** `LOGHUB-ING-001A`  
**Phase:** Phase 2 (Centralized Ingestion)  
**Status:** Architecture Specification & Baseline  
**Architecture Reference:** ADR-011, ADR-013, ADR-015, ADR-016

---

## 1. The Durability Guarantee & Invariant

> **The Durability Invariant:**  
> Skyra LogHub returns an HTTP 200 `durably_accepted` response **if and only if** the entire batch has been successfully serialized, appended, and **fsynced to persistent non-volatile physical media** within the Write-Ahead Journal (WAL).

In-memory queue acceptance, volatile caching, or returning HTTP 200 before disk synchronization completes is strictly prohibited. If the gateway process or host machine suffers an instantaneous loss of power immediately after emitting the HTTP response, the accepted batch is guaranteed to be fully recoverable from disk upon reboot.

---

## 2. Event Lifecycle State Machine

LogHub establishes eight formal lifecycle states distinguishing internal processing phases from externally visible API statuses:

```
                  [Client Ingestion Request]
                              |
                              v
                       +--------------+
                       | 1. RECEIVED  | (In-memory buffer)
                       +-------+------+
                               |
                               v
                    +--------------------+
                    | 2. AUTHENTICATED   | (Token verified, project mapped)
                    +----------+---------+
                               |
                               v
                     +-------------------+
                     |   3. VALIDATED    | (Schema & constraints checked)
                     +---------+---------+
                               |
             +-----------------+-----------------+
             | (Atomic WAL write & fsync)        | (Validation/Auth/Constraint Failure)
             v                                   v
  +----------------------+             +-------------------+
  | 4. DURABLY_ACCEPTED  |             |    8. REJECTED    |
  +----------+-----------+             +-------------------+
             | (Returned to Client: 200 OK)
             v
  +----------------------+
  |  5. ARCHIVE_PENDING  | (In WAL, queued for segment writer)
  +----------+-----------+
             |
             +---------------------------------------+
             |                                       | (Server Crash / Dirty Restart)
             v (Normal Segment Rollover & fsync)     v
     +---------------+                     +----------------------+
     |  6. ARCHIVED  |                     | 7. RECOVERY_REQUIRED |
     +---------------+                     +----------------------+
```

### State Classification & External Exposure

| State | Scope | Description | Public API Representation |
|---|---|---|---|
| `received` | Internal | Raw TCP/HTTP request body read into server RAM | None (Transient) |
| `authenticated` | Internal | Client token and tenant/project scopes verified | None (Transient) |
| `validated` | Internal | Canonical Schema v1 and constraints verified | None (Transient) |
| `durably_accepted` | External | Batch committed and fsynced to physical journal | `HTTP 200 OK` (`status: "durably_accepted"`) |
| `archive_pending` | Internal | Committed in journal; awaiting archive worker | None (Internal WAL state) |
| `archived` | Internal | Written to finalized segment and manifest signed | None (Internal Archive state) |
| `recovery_required` | Internal | Uncommitted tail fragment or crash recovery flag | None (Internal Recovery state) |
| `rejected` | External | Failed validation, auth, rate limit, or storage | `HTTP 4xx / 5xx` (`status: "rejected"`) |

---

## 3. The Durable Acceptance Boundary (Physical Commit)

### 3.1 Strict Preconditions for Durable Acknowledgement
A batch response with status `durably_accepted` may be emitted to the HTTP client **only after all** of the following physical operations succeed sequentially:
1. **Contiguous Frame Serialization:** The batch payload, canonical metadata, record count, SHA-256 payload digest, and CRC32C frame checksum are serialized into a single contiguous binary journal frame.
2. **Sequential Append Syscall:** The frame is appended to the active journal segment via POSIX `write()`.
3. **Synchronous Disk Flush:** An explicit `fsync()` (or `fdatasync()`) is issued on the active journal file descriptor, forcing the operating system page cache to flush the dirty blocks to non-volatile controller memory.
4. **Parent Directory Durability:** If a new journal file segment was created or rotated during this operation, an explicit `fsync()` is executed on the parent directory file descriptor to guarantee inode persistence across power failures.
5. **Local Receipt Index Registration:** The batch ID, content digest, journal segment ID, and byte offset are committed to the local crash-safe receipt index.

### 3.2 Storage Assumptions and Physical Boundaries
- **NVMe / SSD Controller Write Caches:** We assume modern enterprise storage controllers adhere to NVMe/SATA flush commands (e.g., `SYNCHRONIZE CACHE` or NVMe Flush command). Non-volatile battery-backed write caches (BBWC) or power-loss protection (PLP) SSDs satisfy this boundary.
- **Consumer Hardware Caveat:** In environments with consumer SSDs lacking PLP where the disk controller falsely acknowledges flush commands, data loss is physically possible upon sudden power cutoff. Production deployments must mandate enterprise SSDs with power-loss protection.
- **Catastrophic Hardware Destruction:** We do not claim data survival against physical drive head destruction, catastrophic motherboard electrical surge, or physical disk pulverization. Cross-zone synchronous replication or multi-node Raft journaling is deferred to Phase 3 clustering. Single-node crash recovery guarantees zero data loss against software crashes, OS panics, and abrupt power interruptions.

---

## 4. Failure & Recovery Contract

| Failure Point | System State | Client Observable Outcome | Recovery Action |
|---|---|---|---|
| Crash during request transmission | Gateway received partial HTTP stream | TCP Reset / Connection Refused | Client retries batch (no server state modified) |
| Crash during schema validation | In-memory payload lost | TCP Reset / Connection Refused | Client retries batch (no server state modified) |
| Crash during journal `write()` syscall | Incomplete trailing bytes in WAL | Connection Reset (No Ack) | On reboot, recovery scans WAL, detects CRC32C mismatch on partial tail, truncates invalid tail. Client retries safely. |
| Crash before `fsync()` completes | Data in dirty OS page cache | Connection Reset (No Ack) | Data lost from volatile cache. Client retries batch safely. |
| Crash immediately AFTER `fsync()` but BEFORE HTTP response sent | Batch committed to disk; client never received Ack | HTTP Timeout / Connection Drop | Client retries with same `batch_id`. Gateway recognizes committed batch in index, returns `200 OK` with `duplicate: true`. Zero duplicate archive append. |
| Out of Disk Space (`ENOSPC`) | Gateway cannot write or fsync | `HTTP 503 STORAGE_NOT_READY` (`retryable: true`) | Gateway sheds load, rejects batch cleanly without partial state. Shipper retains local spool. Operator expands disk. |
| Corrupted Journal Segment | Damaged block on disk | Gateway detects CRC mismatch on startup | Gateway flags segment, quarantines corrupted range, alerts operator. Reconstructs receipt index up to point of corruption. |

---

## 5. Journal-to-Archive Lifecycle Transition

1. **Sequential Replay Worker:** An asynchronous background worker continuously tails the committed journal segments from the last confirmed checkpoint.
2. **Stream Partitioning:** Events are routed to active daily partitions: `${ARCHIVE_ROOT}/${TENANT}/${PROJECT}/${ENV}/${SERVICE}/${DATE}/segment-${PART}.jsonl`.
3. **Segment Finalization:**
   - Active segment closes when it reaches 100 MiB or at UTC 23:59:59.999Z.
   - SHA-256 digest is calculated over the closed `.jsonl` file.
   - `segment-${PART}.manifest.json` is generated with record counts, byte size, hash, and journal commit range.
   - `fsync()` is executed on both the finalized segment and manifest file.
4. **Journal Cleanup:**
   - A journal WAL segment is marked reclaimable only when **all batches** in that segment have been finalized into archived segments and their manifests recorded in PostgreSQL.
   - Journal files are deleted or moved to cold backup, ensuring zero disk leaks.

---

## 6. Filesystem Durability Capability Matrix

| Environment / Filesystem | `fsyncSync(fd)` File Flush | Directory Inode `fsync` | Atomic Segment Rename | Crash Survival Level | Production Readiness |
|---|---|---|---|---|---|
| **Linux local ext4 / xfs** (Direct NVMe/SSD) | Full hardware flush barrier (supported via POSIX `fsync` / `fdatasync`) | Fully supported via directory file descriptor `fsync()` | POSIX atomic `rename()` supported | Process crash, OS panic, abrupt host power loss (with PLP hardware) | **SUPPORTED — PRODUCTION APPROVED** |
| **Windows NTFS (Local Development)** | Supported via Win32 `FlushFileBuffers(HANDLE)` wrapped by Node `fsyncSync(fd)` | **NOT SUPPORTED** (Windows returns `EPERM` / invalid handle on directory `fsync`) | Atomic replacement supported via Win32 `MoveFileEx` (`MOVEFILE_REPLACE_EXISTING`) | Process kill (`SIGKILL` / `exit 137`), OS crash. Power cut survival requires write caching disabled or UPS. | **SUPPORTED — DEVELOPMENT & TESTING ONLY** |
| **Network Filesystems (NFSv3 / NFSv4)** | Flushes to remote server RPC cache (`COMMIT`), high latency jitter | Remote server-dependent | Rename atomicity not guaranteed under concurrent access | Vulnerable to network partitioning and split-brain locking | **UNSUPPORTED / PROHIBITED** |
| **SMB / CIFS / Windows Shares** | Opportunistic locking breaks POSIX guarantees | Not supported | Not atomic across remote clients | Lock breaks cause frame corruption | **UNSUPPORTED / PROHIBITED** |
| **Cloud Object Mounts (s3fs, blobfuse)** | Faked in-memory buffer; flush uploads object asynchronously | Not supported | Non-atomic object copy + delete | Complete data corruption risk on write interruption | **STRICTLY FORBIDDEN FOR WAL** (Archive destination only) |
