# Skyra LogHub — Standalone JSONL Shipping Agent (`@skyra/log-shipper`)

`@skyra/log-shipper` is the standalone, crash-recoverable log shipping daemon for Skyra LogHub. It discovers local JSONL spool segments produced by Skyra logging SDKs (Node.js, Python, NestJS, Next.js, and browser backend proxies), constructs bounded canonical batches, and reliably delivers them to the central NestJS/Fastify Ingestion Gateway over authenticated HTTP.

---

## 1. Architecture & Design Principles

- **File-First Safety (ADR-011):** SDK applications write directly to local disk spools. The shipping daemon runs out-of-process, decoupling application throughput and runtime availability from central network or gateway health.
- **Stable Batch Construction:** Bounded batches maintain deterministic UUIDv4 `batch_id` values, canonical timestamps, and SHA-256 content digests persisted to disk *prior* to network transmission.
- **Crash-Recoverable Checkpointing:** Acknowledged offsets advance *only* upon receiving validated durable receipts (`durably_accepted`). Checkpoints use atomic temp-file write + `fsync` + rename.
- **Active Segment Safety:** Active spool segments currently being appended to by application processes are detected via `.instance.owner` locks. Incomplete trailing lines are recognized as in-flight writes, safely ignored until next polling pass, and never flagged as corruption.
- **Corrupt Line Quarantine:** Corrupted lines in finalized segments are isolated to a dedicated quarantine directory rather than stalling the shipping pipeline or discarding valid events.
- **Source Retention Safety:** Source spool segments are preserved by default. Deletion is opt-in, blocked on active files, and blocked on unacknowledged bytes.

---

## 2. Directory Layout & Discovery

The shipper monitors configured spool roots conforming to the canonical Skyra spool hierarchy:

```
${SPOOL_ROOT}/
└── ${PROJECT_ID}/
    └── ${ENVIRONMENT}/
        └── ${SERVICE_NAME}/
            └── ${INSTANCE_ID}/
                ├── .instance.owner          <-- Active writer PID and lease lock
                ├── 2026-10-24.part-0000.jsonl
                └── 2026-10-24.part-0001.jsonl
```

### Path Containment & Traversal Safety
The shipper asserts that all discovered file paths reside strictly within permitted `spoolRoots` using `fs.realpathSync`. Any symbolic link or directory traversal escape attempt (`../`) is rejected immediately with an audit log.

---

## 3. Configuration & Options

`ShipperConfig` parameters:

| Option | Type | Default | Description |
|---|---|---|---|
| `spoolRoots` | `string[]` | *Required* | List of absolute root directories to scan for SDK spools |
| `checkpointDir` | `string` | *Required* | Directory where local checkpoint state files are persisted |
| `gatewayUrl` | `string` | *Required* | Central gateway ingestion URL (`http://<host>:<port>/ingest/v1/logs`) |
| `authToken` | `string` | *Required* | Scoped Bearer machine token (`Authorization: Bearer <token>`) |
| `maxBatchEvents` | `number` | `500` | Maximum number of log events per submitted batch |
| `maxBatchBytes` | `number` | `1048576` (1MB) | Maximum payload byte size per submitted batch |
| `requestTimeoutMs` | `number` | `10000` (10s) | HTTP client request timeout |
| `quarantineDir` | `string` | `undefined` | Target directory for quarantining corrupted lines in finalized segments |
| `retention` | `object` | `{ deleteAcknowledgedFiles: false }` | Retention cleanup policy (preserves source data by default) |

---

## 4. Local Checkpoint Format

Checkpoints are stored as JSON files under `${checkpointDir}` keyed by a sanitised file locator.

```json
{
  "relativeLocator": "skyra-tech/production/order-api/inst-01/2026-10-24.part-0000.jsonl",
  "fullPath": "/var/log/skyra/skyra-tech/production/order-api/inst-01/2026-10-24.part-0000.jsonl",
  "lastAckOffset": 45182,
  "lastAckTimestamp": "2026-10-24T18:00:02.124Z",
  "pendingBatch": null,
  "lastReceipt": {
    "receipt_id": "rcpt_a1b2c3d4",
    "journal_segment": "active.wal",
    "content_digest": "sha256:7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069",
    "committed_at": "2026-10-24T18:00:02.124Z"
  },
  "deliveryAttempts": 0,
  "lastError": null,
  "lastErrorStatus": null,
  "updatedAt": "2026-10-24T18:00:02.125Z"
}
```

### Crash Recovery Guarantees
If the shipper crashes while a batch is in-flight:
1. Upon restart, `getRecord()` recovers `pendingBatch`.
2. The exact same `batchId`, `events`, and `contentDigestSha256` are retransmitted to the gateway.
3. The central gateway recognizes the duplicate submission and returns the original receipt with `duplicate: true`.
4. The shipper advances `lastAckOffset` and clears `pendingBatch`, guaranteeing zero duplicates in WAL and zero lost events.

---

## 5. Gateway Authentication & Security Boundaries

- **Machine Token Provisioning:** Ingestion requires a valid Bearer token provisioned in the central gateway metadata store.
- **Token Redaction:** The shipper scrubs all occurrences of `authToken` from operational log messages, error diagnostics, and exception traces.
- **Frontend / Browser Security Boundary:** Browser applications (`@skyra/logger-browser`, React, Angular) must NEVER hold permanent machine credentials. Instead, browser logs route to a same-origin application backend proxy, which attaches the machine token before forwarding to the central gateway.
- **Project Isolation:** The gateway enforces project and environment access control. Ingesting logs under an unauthorized `project_id` returns HTTP 403 `PROJECT_ACCESS_DENIED`.

---

## 6. HTTP Error Handling & Retry Engine

| HTTP Status / Condition | Classification | Shipper Behavior |
|---|---|---|
| Connection reset / Network timeout | **Retryable** | Retries with exponential backoff and jitter; keeps pending batch |
| `HTTP 429 Too Many Requests` | **Retryable** | Honors gateway `Retry-After` header; pauses delivery |
| `HTTP 500 / 502 / 503 / 504` | **Retryable** | Retries with backoff; fails closed if durability backend unavailable |
| `HTTP 401 Unauthorized` | **Permanent** | Halts shipping; logs error without leaking token; preserves source |
| `HTTP 403 Forbidden` | **Permanent** | Unauthorized project/environment; halts shipping; preserves source |
| `HTTP 409 Conflict` | **Permanent** | Idempotency conflict (different payload reusing batch ID); operator intervention |
| `HTTP 422 Unprocessable` | **Permanent** | Schema validation failure; halts batch; isolates or retains source |

---

## 7. CLI Usage

Run the shipper directly from the command line:

```bash
# Start shipping daemon
node dist/cli.js \
  --spool-root /var/log/skyra \
  --checkpoint-dir /var/lib/skyra-shipper/checkpoints \
  --gateway-url http://gateway.internal:3000/ingest/v1/logs \
  --auth-token $SKYRA_INGEST_TOKEN \
  --interval 5000
```

---

## 8. Operational Limitations & Known Boundaries

1. **Seven-Day Deduplication Horizon:** The central gateway guarantees duplicate idempotency for up to 7 days. Retrying batches older than 7 days will be reaccepted as new events.
2. **Single-Active-Writer per Spool Segment:** Local spool directories must only have one active SDK writer at any time, governed by `.instance.owner`.
3. **No Multi-Host Active-Active Spools:** Spool directories must reside on local node filesystems, not shared NFS/SMB mounts without POSIX locking support.
