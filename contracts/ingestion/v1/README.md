# Skyra LogHub — Ingestion Contracts v1

**Version:** 1.0.0  
**Phase:** Phase 2 (Centralized Ingestion)  
**Status:** Canonical Interface Specification  
**Architecture Reference:** ADR-012, ADR-013, ADR-014, ADR-015, ADR-016

---

## 1. Overview

This directory contains the machine-readable API specifications, JSON schemas, error response definitions, and segment manifest contracts governing the Centralized Ingestion Gateway for Skyra LogHub.

All contracts enforce **atomic all-or-nothing acceptance** backed by a crash-recoverable, fsynced journal (WAL). HTTP 207 Multi-Status partial acceptance is rejected in the MVP.

---

## 2. Specification Directory Structure

```text
contracts/ingestion/v1/
  ├── openapi.yaml                 # OpenAPI 3.1.0 specification for ingestion gateway
  ├── batch-request.schema.json    # JSON Schema (Draft 2020-12) for batch requests
  ├── batch-response.schema.json   # JSON Schema (Draft 2020-12) for durable responses
  ├── error-response.schema.json   # JSON Schema (Draft 2020-12) for error payloads
  ├── segment-manifest.schema.json # JSON Schema (Draft 2020-12) for archive segment manifests
  ├── README.md                    # This contract guide
  └── examples/
      ├── valid-authoritative-batch-request.json
      ├── valid-legacy-batch-request.json
      ├── valid-durably-accepted-response.json
      ├── valid-duplicate-response.json
      ├── valid-error-validation-failed.json
      ├── valid-error-idempotency-conflict.json
      ├── valid-error-storage-not-ready.json
      └── valid-segment-manifest.json
```

---

## 3. Endpoints

| Method | Path | Auth | Description | Status Codes |
|---|---|---|---|---|
| `POST` | `/ingest/v1/logs` | `Bearer <token>` | Ingest atomic batch of canonical log events | 200, 400, 401, 403, 409, 413, 422, 429, 503 |
| `GET` | `/health/live` | None | Process liveness probe | 200 |
| `GET` | `/health/ready` | None | Durability engine readiness probe | 200, 503 |

---

## 4. Atomic Ingestion Semantics

1. **All-or-Nothing Acceptance**:
   - The entire batch is validated before any record is committed.
   - If any single event in the batch violates the Canonical Schema v1 or project authorization, the entire batch is rejected with `422 Unprocessable Content` or `403 Forbidden`.
   - No events from a rejected batch are committed to the journal or archive.
2. **Durable Acceptance (`200 OK`)**:
   - Status `durably_accepted` is returned **only after** the complete batch has been written and fsynced to the active journal WAL segment on disk.
   - In-memory acceptance without fsync is strictly prohibited.
3. **Idempotency & Replay**:
   - Clients supply an RFC 4122 UUIDv4 `batch_id`.
   - Identical retries (same `batch_id` and same SHA-256 payload digest) return `200 OK` with `duplicate: true` and the original receipt metadata.
   - Reusing a `batch_id` with different content returns `409 Conflict` (`IDEMPOTENCY_CONFLICT`).
4. **Legacy Browser Compatibility**:
   - The gateway accepts batches without `protocol_version` or `batch_id`.
   - The gateway computes a deterministic synthetic batch ID and SHA-256 content digest, providing event-level deduplication within the retention horizon.

---

## 5. Standard Error Codes

| Code | HTTP | Description | Retryable |
|---|---|---|---|
| `INVALID_JSON` | 400 | Malformed JSON syntax or duplicate keys | No |
| `BATCH_EMPTY` | 400 | Empty events array | No |
| `UNAUTHORIZED` | 401 | Missing or invalid Bearer token | No |
| `PROJECT_ACCESS_DENIED` | 403 | Credential unauthorized for specified project | No |
| `ENVIRONMENT_MISMATCH` | 403 | Credential unauthorized for specified environment | No |
| `IDEMPOTENCY_CONFLICT` | 409 | Batch ID reused with modified payload digest | No |
| `BATCH_OVERSIZED` | 413 | Batch exceeds 500 events | No |
| `PAYLOAD_TOO_LARGE` | 413 | Batch payload exceeds 5MB uncompressed | No |
| `SCHEMA_VALIDATION_FAILED`| 422 | One or more events failed canonical schema | No |
| `UNSUPPORTED_PROTOCOL_VERSION` | 422 | Protocol version unrecognized | No |
| `RATE_LIMIT_EXCEEDED` | 429 | Rate limit or quota exceeded | Yes (after `Retry-After`) |
| `STORAGE_NOT_READY` | 503 | Gateway alive but storage engine not ready | Yes (with backoff) |
| `JOURNAL_UNAVAILABLE` | 503 | Journal write or fsync failure | Yes (with backoff) |
