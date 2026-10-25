# Skyra LogHub — Central Archive Storage Architecture

**Document ID:** `LOGHUB-DOC-ING-005`  
**Task Reference:** `LOGHUB-ING-001A`  
**Phase:** Phase 2 (Centralized Ingestion)  
**Status:** Architecture Specification & Baseline  
**Architecture Reference:** ADR-011, ADR-014, ADR-015, ADR-016

---

## 1. Directory Layout & Partition Hierarchy

The Central Archive is the permanent, authoritative storage tier of Skyra LogHub. All archived logs are organized into deterministic, strictly isolated directory partitions:

```text
${ARCHIVE_ROOT}/
  └── ${TENANT_ID}/
      └── ${PROJECT_ID}/
          └── ${ENVIRONMENT}/
              └── ${SERVICE_NAME}/
                  └── ${YYYY-MM-DD}/
                      ├── segment-0000.jsonl
                      ├── segment-0000.manifest.json
                      ├── segment-0001.jsonl
                      └── segment-0001.manifest.json
```

### Path Components & Validation Rules

| Component | Description | Format / Pattern | Source of Authority |
|---|---|---|---|
| `ARCHIVE_ROOT` | Base directory on persistent volume (e.g., `/var/loghub/archive`) | Absolute path | System Configuration |
| `TENANT_ID` | Canonical enterprise tenant identifier | `^[a-z0-9]+(-[a-z0-9]+)*$` (Max 64 chars) | Server Bearer Token |
| `PROJECT_ID` | Project identifier within the tenant | `^[a-z0-9]+(-[a-z0-9]+)*$` (Max 64 chars) | Verified Credential Scope |
| `ENVIRONMENT` | Deployment tier | `production` \| `staging` \| `development` \| `test` \| `local` | Credential Scope & Event Body |
| `SERVICE_NAME` | Originating microservice / app name | `^[a-z0-9]+(-[a-z0-9]+)*$` (Max 64 chars) | Canonical Event `service.name` |
| `YYYY-MM-DD` | Event occurrence UTC calendar date | `^\d{4}-\d{2}-\d{2}$` | Event `@timestamp` |
| `PART_INDEX` | 4-digit zero-padded monotonic segment index | `^\d{4}$` (`0000`–`9999`) | Archive Writer Counter |

---

## 2. Path Safety & Containment Verification

To prevent path traversal, directory escape, or cross-tenant contamination:
1. **Root Containment Check:** Every resolved file path is verified using realpath canonicalization:
   ```typescript
   const resolvedPath = path.resolve(archiveRoot, tenantId, projectId, env, service, date, filename);
   if (!resolvedPath.startsWith(path.resolve(archiveRoot) + path.sep)) {
     throw new SecurityError(`Path traversal attempt detected: ${resolvedPath}`);
   }
   ```
2. **Strict Character Allowlist:** All path segments are validated against `^[a-z0-9_-]+$`. Directory separators (`/`, `\`), null bytes (`%00`), and parent directory references (`..`) are strictly rejected.
3. **Symlink Prohibition:** Archive directories are opened with `O_NOFOLLOW` on POSIX systems. If any component in the hierarchy is a symbolic link, writing is halted and an alert is raised.

---

## 3. Segment Lifecycle, Rollover & Immutability

### 3.1 Single-Writer Process Ownership
In accordance with ADR-011 and `contracts/storage-contract.md`, exactly one archive worker process owns the active segment for a given `(tenant, project, environment, service, date)` partition. Writers never compete for locks across processes.

### 3.2 Rollover Criteria
An active segment (`segment-${PART}.jsonl`) is closed and finalized when:
1. **Size Threshold:** The uncompressed segment file size reaches **100 MiB (104,857,600 bytes)**.
2. **UTC Midnight Transition:** The system clock passes `00:00:00.000Z` UTC. All events are routed to the new date partition.

### 3.3 Finalization & Manifest Generation Protocol
When an active segment reaches its rollover boundary:
1. **Flush & Sync:** `fsync()` is executed on the open file descriptor of `segment-${PART}.jsonl`.
2. **Checksum Calculation:** The worker reads the file from byte 0 to EOF and computes its SHA-256 cryptographic digest.
3. **Record Count & Range:** Total canonical JSONL lines, byte length, earliest `@timestamp`, and latest `@timestamp` are compiled.
4. **Manifest Creation:** The companion `segment-${PART}.manifest.json` is written atomically using a temporary file and atomic rename:
   ```text
   segment-${PART}.manifest.tmp -> segment-${PART}.manifest.json
   ```
5. **Parent Directory fsync:** `fsync()` is executed on the partition directory to ensure directory entries are durably committed.
6. **Read-Only Lock:** The file permissions of both `.jsonl` and `.manifest.json` are set to `0o440` (read-only for owner/group). The finalized segment is completely immutable.

---

## 4. Journal Replay & Archive Reconciliation

```
[Journal WAL Segment 0001]
  |
  +---> [Batch 1] (Offset: 0 - 50KB) ---------> Appended to segment-0000.jsonl
  +---> [Batch 2] (Offset: 50KB - 120KB) -----> Appended to segment-0000.jsonl
  |     ...
  +---> [Batch 950] (Offset: 99.8MB - 100MB) -> Segment reaches 100MB threshold
                                                |
                                                v
                                        Finalize segment-0000.jsonl
                                        Write segment-0000.manifest.json (fsync)
                                        Update PostgreSQL Catalog Checkpoint:
                                          watermark = { segment: "wal-0001", offset: 104857600 }
                                                |
                                                v
                                        Open segment-0001.jsonl
```

### Journal Truncation Safety Rules
1. A WAL segment is marked **reclaimable** only after all batches within that WAL segment have been:
   - Written to finalized archive segments.
   - Fsynced to disk along with their manifests.
   - Recorded in the PostgreSQL `archive_segments` table.
2. Under no circumstances may a WAL segment be truncated while any contained batch remains in an active (unfinalized) archive segment.
