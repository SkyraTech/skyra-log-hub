# @skyra/ingestion-gateway

Secure Centralized Ingestion Gateway for the Skyra LogHub Observability Platform.

Established in **Task LOGHUB-ING-002** (Phase 2: Centralized Ingestion Gateway Foundation).  
Hardened in **Task LOGHUB-ING-003** (Phase 2: Durable Write-Ahead Journal, PostgreSQL Integration & Central JSONL Archive).

---

## 1. Overview

The Skyra Ingestion Gateway serves as the authoritative, hardened ingress boundary for structured log events emitted by Skyra logging SDKs (Node.js, NestJS, Next.js, Browser, React, Angular, Python).

Built with **NestJS** and the high-performance **Fastify** HTTP adapter, it enforces:
- Strict JSON transport validation with recursive duplicate-key rejection.
- Authoritative machine bearer token authentication (`Authorization: Bearer <token>`).
- Strict tenant isolation and multi-project authorization boundaries.
- Full validation against the canonical Skyra ECS log event schema (`contracts/schemas/v1/log-event.schema.json`).
- Backward compatibility for legacy browser SDK batch envelopes.
- Atomic whole-batch admission semantics (all-or-nothing).
- Recoverable Write-Ahead Journal (WAL) with contiguous binary framing (`SWAL`...`EWAL`), version 1, payload length prefix, 16B UUIDv4, fixed 64B tenant/project identity, uint32 event count, 32B SHA-256 payload digest, payload bytes, and 4B CRC32C checksum.
- Physical durability boundary with synchronous hardware `fsync` barrier (`fs.fsyncSync(fd)`).
- Immutable, tenant-isolated canonical Central JSONL Archive segments with 100 MiB and UTC midnight rollover.
- Companion cryptographic manifests (`segment-XXXX.manifest.json`) validated against `contracts/ingestion/v1/segment-manifest.schema.json`.
- 7-day bounded deduplication receipts with idempotency replay confirmation and conflict detection on reused batch IDs.
- Deterministic crash recovery with automated truncation of incomplete trailing writes to the last valid commit boundary.
- Real Prisma PostgreSQL repositories for metadata, operational receipts, archive manifests, and checkpoints.
- Sliding-window in-memory rate limiting and body size quotas.
- Operational telemetry and diagnostics without sensitive data leakage.
- Independent liveness and durability readiness probes (`/health/live`, `/health/ready`).

---

## 2. Durability Boundary & Invariants (LOGHUB-ING-003)

> **THE DURABILITY INVARIANT (ADR-013 / ADR-016):**  
> Skyra LogHub returns an HTTP 200 `durably_accepted` response **if and only if** the entire batch has been successfully serialized, appended, and **fsynced to persistent non-volatile physical media** within the Write-Ahead Journal (WAL).
>
> In-memory queue acceptance, volatile caching, or returning HTTP 200 before disk synchronization completes is strictly prohibited. If the gateway process or host machine suffers an instantaneous loss of power immediately after emitting the HTTP response, the accepted batch is guaranteed to be fully recoverable from disk upon reboot.

---

## 3. Endpoints

| Method | Route | Auth Required | Description | Status Code |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/health/live` | No | Liveness probe indicating process health | `200 OK` |
| `GET` | `/health/ready` | No | Readiness probe indicating durability availability | `200 OK` (or `503` if storage uninitialized) |
| `POST` | `/ingest/v1/logs` | Yes (`Bearer <token>`) | Ingestion endpoint for canonical and legacy batches | `200 OK` (`status: "durably_accepted"`), `409` conflict, or `503` |

### Sample Response (`POST /ingest/v1/logs`):
```json
{
  "status": "durably_accepted",
  "batch_id": "550e8400-e29b-41d4-a716-446655440000",
  "accepted_count": 25,
  "duplicate": false,
  "receipt": {
    "receipt_id": "018f4a1b-1234-7000-8000-000000000001",
    "journal_segment": "active.wal",
    "journal_offset": 1048576,
    "committed_at": "2026-10-24T12:00:00.000Z",
    "content_digest": "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
  }
}
```

---

## 4. Storage Architecture & Data Layout

### Write-Ahead Journal (WAL) Layout
WAL files reside in `${WAL_DIRECTORY}` (default: `./data/wal`):
```text
${WAL_DIRECTORY}/
  ├── active.wal           # Active append-only journal segment
  ├── journal-0000.wal     # Rotated immutable journal segments (64 MiB boundary)
  └── journal-0001.wal
```

### Central JSONL Archive Layout
Immutable archive segments reside in `${ARCHIVE_ROOT}` (default: `./data/archive`):
```text
${ARCHIVE_ROOT}/
  └── ${TENANT_ID}/
      └── ${PROJECT_ID}/
          └── ${ENVIRONMENT}/
              └── ${SERVICE_NAME}/
                  └── ${YYYY-MM-DD}/
                      ├── segment-0000.jsonl          # Canonical JSONL log records
                      ├── segment-0000.manifest.json # Finalized cryptographic manifest
                      ├── segment-0001.jsonl
                      └── segment-0001.manifest.json
```

---

## 5. Environment Variables

Configure the gateway via environment variables (or `.env`):

| Variable | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | String | `development` | Environment mode (`development`, `production`, `test`) |
| `HOST` | String | `0.0.0.0` | Gateway bind interface |
| `PORT` | Number | `4000` | Gateway HTTP listen port |
| `DATABASE_URL` | String | *(placeholder)* | PostgreSQL connection string for Prisma metadata catalog |
| `WAL_DIRECTORY` | String | `./data/wal` | Directory for Write-Ahead Journal files |
| `WAL_MAX_SEGMENT_BYTES` | Number | `67108864` | WAL segment rotation size in bytes (64 MiB default) |
| `ARCHIVE_ROOT` | String | `./data/archive` | Root directory for canonical Central JSONL Archive |
| `ARCHIVE_MAX_SEGMENT_BYTES` | Number | `104857600` | Archive segment rotation size in bytes (100 MiB default) |
| `MAX_BATCH_SIZE` | Number | `500` | Maximum allowable events per batch (1..5000) |
| `MAX_PAYLOAD_BYTES` | Number | `5242880` | Maximum allowable request body size in bytes (5 MiB) |
| `DEFAULT_RATE_LIMIT_PER_MINUTE` | Number | `600` | Default sliding-window quota per credential |
| `BURST_RATE_LIMIT_PER_MINUTE` | Number | `1200` | Maximum burst sliding-window quota per credential |
| `CORS_ORIGINS` | String | `http://localhost:3000,http://localhost:4200` | Permitted proxy and application origins |
| `SHUTDOWN_TIMEOUT_MS` | Number | `10000` | Graceful shutdown timeout in milliseconds |

---

## 6. PostgreSQL Metadata Setup

### User Environment Requirement
The user already maintains existing pgAdmin installations and active PostgreSQL servers for other production projects. **No automatic migrations, database creations, or dockerized databases are performed by this package.**

### Development Database Setup Instructions:
1. Open pgAdmin or `psql` on your existing PostgreSQL instance.
2. Create an isolated database:
   ```sql
   CREATE DATABASE skyra_loghub_dev;
   CREATE USER skyra_loghub_user WITH ENCRYPTED PASSWORD 'your_secure_password';
   GRANT ALL PRIVILEGES ON DATABASE skyra_loghub_dev TO skyra_loghub_user;
   ```
3. Update `.env`:
   ```env
   DATABASE_URL="postgresql://skyra_loghub_user:your_secure_password@localhost:5432/skyra_loghub_dev?schema=public"
   ```
4. Review the migration script before applying:
   `prisma/migrations/20261024000000_init_metadata/migration.sql`

> **Offline Mode Note:** If `DATABASE_URL` contains the default `REPLACE_ME` placeholder, `MetadataModule` automatically falls back to in-memory repositories. All unit, integration, and security tests run 100% offline without requiring any database server!

---

## 7. Testing & Benchmarking

```bash
# Run all gateway tests (unit + integration + security + storage)
pnpm test

# Run isolated unit tests
pnpm test:unit

# Run real Fastify HTTP integration tests
pnpm test:integration

# Run security hardening tests
pnpm test:security

# Run durable WAL and fsync performance benchmark
pnpm bench
```

---

## 8. Next Step: Task LOGHUB-ING-004

Task **`LOGHUB-ING-004`** will address:
- Idempotency, replay, and receipt index hardening.
- Cross-process concurrency locking and distributed worker coordination.
- Optional Valkey read-through performance cache integration.
- 7-day receipt retention background compactor.
- Comprehensive 12-scenario failure matrix stress tests.
