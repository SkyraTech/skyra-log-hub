# Skyra LogHub — Ingestion Security Threat Model

**Document ID:** `LOGHUB-DOC-ING-006`  
**Task Reference:** `LOGHUB-ING-001A`  
**Phase:** Phase 2 (Centralized Ingestion)  
**Status:** Architecture Specification & Baseline  
**Architecture Reference:** ADR-007, ADR-012, ADR-013, ADR-015, ADR-016

---

## 1. Overview & Threat Vectors

The Centralized Ingestion Gateway is an external-facing network perimeter receiving telemetry across multiple organizations, services, and environments. This document systematically models threat vectors targeting the ingestion pipeline, evaluating potential attack scenarios, defensive mitigations, verification methods, and residual risks.

---

## 2. Threat Analysis Matrix

### 2.1 Cache Eviction & Replay Bypass
- **Attack Scenario:** Attacker floods Valkey with dummy keys to trigger LRU eviction of deduplication receipts. Attacker then replays previously committed log batches to inflate log volumes or trigger repeated billing/processing actions.
- **Mitigation:** Authoritative deduplication relies on the persistent PostgreSQL receipt index and journal state. Valkey is non-authoritative. Cache misses fall back to the durable receipt table before any write occurs.
- **Verification:** Unit test `tests/contracts/ingestion-contracts.test.ts` confirms deduplication semantics are decoupled from transient caches. Stress test artificially flushes Valkey during batch re-submission.
- **Remaining Risk:** Latency increases during cache thrashing as database handles receipt lookups.

### 2.2 Expired Deduplication State
- **Attack Scenario:** Attacker or uncoordinated shipper captures a valid batch and replays it 8 days later, after the 7-day retention horizon has elapsed.
- **Mitigation:** The 7-day retention horizon is an explicit documented constraint. Replayed batches older than 7 days are accepted as new batches. Shippers must maintain local checkpoint watermarks to avoid re-shipping acknowledged spools.
- **Verification:** Retention pruning job tests verify that records older than 7 days are pruned from PostgreSQL without affecting archive immutability.
- **Remaining Risk:** Events may be appended again if a shipper re-spools data older than 7 days.

### 2.3 Cross-Tenant Replay
- **Attack Scenario:** Malicious Tenant B intercepts a batch submitted by Tenant A and attempts to replay it using Tenant B's credentials to pollute Tenant A's archive or inject forged telemetry into Tenant A.
- **Mitigation:** The gateway derives `tenant_id` exclusively from the verified Bearer token, completely ignoring any tenant identifiers in the request payload. Replayed batches in Tenant B are stored strictly in Tenant B's partition.
- **Verification:** Security contract test verifies that Tenant B submitting Tenant A's payload results in Tenant B's partition being targeted.
- **Remaining Risk:** Zero cross-tenant data leakage or partition escape.

### 2.4 Same Batch ID with Modified Content
- **Attack Scenario:** Attacker or buggy client reuses an existing `batch_id` but alters log event severity or payload text, attempting to mask a security incident while receiving a duplicate acknowledgement.
- **Mitigation:** The gateway computes a SHA-256 digest over the entire uncompressed batch payload and compares it with the digest stored for that `batch_id`. Any mismatch triggers `409 Conflict` (`IDEMPOTENCY_CONFLICT`) without modifying storage.
- **Verification:** Test 11 in `tests/contracts/ingestion-contracts.test.ts` validates `IDEMPOTENCY_CONFLICT` schema.
- **Remaining Risk:** None; digest collision on SHA-256 is computationally infeasible.

### 2.5 Unauthorized Browser-Origin Project Selection
- **Attack Scenario:** Attacker manipulates JavaScript code in the browser to submit logs claiming to originate from an internal administrative project (e.g. `skyra-vault`).
- **Mitigation:** Browser sends logs to the same-origin backend proxy. The backend proxy ignores client-requested project IDs and hardcodes its own authorized `PROJECT_ID` before forwarding to LogHub. The gateway verifies that the project ID is in the credential's `allowed_projects`.
- **Verification:** Mock ingestion test verifies that unauthorized project selection yields `403 Forbidden` (`PROJECT_ACCESS_DENIED`).
- **Remaining Risk:** If an application backend proxy is compromised, it could abuse its authorized project scope.

### 2.6 Proxy Credential Compromise
- **Attack Scenario:** Attacker compromises an application backend proxy server and extracts its LogHub ingestion Bearer token.
- **Mitigation:** Credentials are scoped to specific projects and environments. Operators can revoke the credential in PostgreSQL with immediate effect (sub-minute TTL). Gateway audits all token usage.
- **Verification:** Revocation integration tests confirm that setting `is_revoked = true` rejects subsequent requests with `401 UNAUTHORIZED`.
- **Remaining Risk:** Attacker can submit forged logs within the credential's allowed project scope until revocation is executed.

### 2.7 CSRF Against First-Party Telemetry
- **Attack Scenario:** Malicious website lures an authenticated user into triggering cross-site POST requests to the application's telemetry proxy (`/api/telemetry`), generating forged browser errors.
- **Mitigation:** The application proxy implements standard CSRF protections (anti-forgery tokens, `SameSite=Strict` or `Lax` cookies, origin header verification). Browser SDK HTTP transport uses `credentials: 'same-origin'`.
- **Verification:** Browser E2E suite verifies clean cross-origin denial.
- **Remaining Risk:** Misconfigured application proxies that omit CSRF checks could be targeted.

### 2.8 Oversized Legacy Batches
- **Attack Scenario:** Attacker or misbehaving legacy client submits a massive single batch containing 100,000 events or 100 MB of JSON, attempting to exhaust gateway memory.
- **Mitigation:** Fastify server enforces hard body limits (max 5 MiB). Request schema enforces `maxItems: 500`. Excess payloads are rejected with `413 Payload Too Large` or `413 BATCH_OVERSIZED` before schema validation or memory expansion.
- **Verification:** Test 7 in `tests/contracts/ingestion-contracts.test.ts` validates rejection of oversized batches.
- **Remaining Risk:** Minor network bandwidth consumption during payload transmission before rejection.

### 2.9 Partial Journal Record Exploitation
- **Attack Scenario:** Power is cut mid-write. Attacker attempts to trick the recovery worker into interpreting a corrupted or truncated trailing record as valid telemetry.
- **Mitigation:** Every journal frame includes a frame length and a CRC32C checksum. During recovery, any trailing bytes that fail checksum or length checks are truncated and quarantined.
- **Verification:** WAL recovery test injects truncated bytes and asserts clean recovery.
- **Remaining Risk:** None; partial writes are discarded before acceptance.

### 2.10 Premature Durable Acknowledgement
- **Attack Scenario:** Ingestion gateway returns HTTP 200 before the journal record is fsynced to disk. If the server crashes immediately after, the client assumes data is saved, but it is lost from the page cache.
- **Mitigation:** Architectural invariant enforced in code: HTTP 200 response handler is called exclusively from the `fsync()` callback/await.
- **Verification:** Code audit gate and fault injection tests verify that failures in `fsync` trigger HTTP 503.
- **Remaining Risk:** Disks with broken flush implementations (consumer drives lacking power-loss protection).

### 2.11 Journal Corruption
- **Attack Scenario:** Bit rot or storage controller malfunction damages committed journal blocks.
- **Mitigation:** Journal segments include frame-level CRC32C and file-level SHA-256 checks. Corrupted segments trigger automated quarantine and operator alerting.
- **Verification:** Integrity checker scripts verify frame checksums during replay.
- **Remaining Risk:** Data in damaged blocks may be lost if not yet archived and no hardware RAID/backup exists.

### 2.12 Replay Following Journal Compaction
- **Attack Scenario:** Journal segment is compacted and deleted. Shipper retries an old batch, attempting to bypass deduplication because the journal record is gone.
- **Mitigation:** Deduplication state is maintained in PostgreSQL `deduplication_receipts` independently of journal segment deletion for the entire 7-day retention horizon.
- **Verification:** Test verifies duplicate rejection even after journal file is deleted.
- **Remaining Risk:** Batches replayed after 7 days will be re-accepted.

### 2.13 Duplicate Archive Append
- **Attack Scenario:** Archive worker crashes and restarts. Replays the journal from an earlier offset, causing events to be appended twice to `segment-${PART}.jsonl`.
- **Mitigation:** The archive worker persists its high watermark (`journal_commit_range: { start_offset, end_offset }`) in both PostgreSQL and `.manifest.json`. On startup, it seeks forward to the high watermark before writing.
- **Verification:** Crash simulation verifies zero duplicate lines in archive segments.
- **Remaining Risk:** None with single-writer ownership.

### 2.14 Inconsistent Metadata Receipt State
- **Attack Scenario:** Journal commits, but database connection fails when writing receipt.
- **Mitigation:** Gateway relies on the local WAL segment as the ground truth. On restart, WAL reconciliation synchronizes missing receipts to PostgreSQL.
- **Verification:** Reconciliation tests verify that missing DB rows are automatically restored from the WAL.
- **Remaining Risk:** Temporary delay during recovery if database is unreachable.
