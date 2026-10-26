# Query Consistency & Keyset Pagination Specification

**Document Version:** 1.0.0  
**Status:** Approved Architecture Specification  
**Task Reference:** LOGHUB-QUERY-001  
**Applies To:** Query Service Foundation (`apps/query-service`)

---

## 1. Query Freshness & Consistency Model

### 1.1 Ingestion-to-Query Lifecycle Reality

In Skyra LogHub, the ingestion pipeline guarantees zero data loss via a three-tier durability lifecycle:
1. **Durable WAL Commitment (0 - 5 ms):** Ingestion Gateway appends events to the binary Write-Ahead Log with `fsync`. Client receives HTTP 202/200 acknowledgement.
2. **Canonical Segment Archival (500 ms - 60 s):** Batch writer rotates, writes, and finalizes canonical JSONL segments on disk, recording completion in PostgreSQL (`archive_segments`).
3. **Parquet Acceleration (10 s - 5 min):** Background worker converts finalized JSONL segments into compressed Parquet.

### 1.2 Eventual Consistency Watermark

**The Query Service operates on finalized archive segments.**

- It does **not** scan uncommitted or active WAL files directly. Reading active WAL would introduce locks, read/write contention with the ingestion writer, and expose uncommitted or in-flight transactions.
- **Archive Freshness Lag:** The typical search freshness lag equals the segment rotation interval (configured between 5 seconds and 60 seconds).
- **Archive Watermark Reporting:** Every search response reports `meta.archive_watermark`, indicating the timestamp of the latest finalized archive segment evaluated in the search:
  ```json
  "meta": {
    "archive_watermark": "2026-10-25T11:58:30.000Z",
    "freshness_lag_seconds": 14
  }
  ```
- **User-Facing Transparency:** Dashboards and AI tools display the archive watermark so users are explicitly aware that events ingested within the last several seconds are pending segment rotation.

---

## 2. Keyset Pagination & Deterministic Sorting

### 2.1 The Failure of Offset Pagination
Traditional `OFFSET` / `LIMIT` pagination in distributed or file-based analytical engines exhibits severe flaws:
- $O(N)$ execution cost: Scanning through 1,000,000 events to read page 1,000 requires parsing and discarding all 1,000,000 preceding events.
- Duplicate and skipped records: If new segments are published while a user paginates, offsets shift, causing records to appear twice or vanish completely.

### 2.2 Composite Deterministic Sort Key
To guarantee 100% deterministic, non-shifting pagination, the Query Service orders results by a composite key:
1. **Primary Sort Key:** `@timestamp` (`TIMESTAMP WITH TIME ZONE`).
2. **Secondary Tie-Breaker:** `event.id` (UUIDv7 string).
3. **Tertiary Tie-Breaker:** Segment internal record offset (integer).

Because `event.id` is generated using UUIDv7 (which is time-ordered and contains 74 bits of cryptographically strong randomness), the tuple `(@timestamp, event.id)` is globally unique across the entire platform.

---

## 3. Cryptographic Opaque Cursor Design

### 3.1 Cursor Payload (`cursor.schema.json`)

Pagination cursors returned to the client are base64url-encoded, HMAC-SHA256 authenticated JSON structures:

```typescript
export interface QueryCursorPayload {
  version: 1;
  query_hash: string;       // SHA-256 of canonicalized query parameters (prevents reuse across different filters)
  tenant_id: string;        // Tenant scope boundary
  projects: string[];       // Project scope boundary
  sort_order: 'asc' | 'desc';
  last_timestamp: string;   // ISO 8601 UTC timestamp of last item on current page
  last_event_id: string;    // UUIDv7 of last item on current page
  created_at: number;       // Unix epoch seconds
  expires_at: number;       // Unix epoch seconds (TTL: 1 hour)
  signature: string;        // HMAC-SHA256(payload_bytes, SERVER_CURSOR_SECRET)
}
```

### 3.2 Security & Integrity Controls
- **Tamper-Proof:** Any modification to `last_timestamp`, `tenant_id`, or `projects` invalidates the HMAC signature, causing the query to fail with `400 Bad Request` (`INVALID_CURSOR`).
- **Filter Binding:** The cursor embeds `query_hash` computed over the normalized search filters. If a client attempts to use a cursor generated for `log.level = 'error'` on a subsequent query for `log.level = 'info'`, the server detects the mismatch and rejects the cursor.
- **Tenant & Scope Binding:** If a principal attempts to replay a cursor belonging to another tenant or project, the server denies access.
- **Bounded Expiration:** Cursors expire after 1 hour (`expires_at`), preventing stale cursor accumulation and ensuring users query fresh catalog states.

---

## 4. Keyset SQL Execution Mechanics

When a valid cursor is provided, the Query Planner translates `(last_timestamp, last_event_id)` into DuckDB inequality predicates:

### For Descending Sort (`order = 'desc'`):
```sql
WHERE (
  "@timestamp" < $last_timestamp
  OR ("@timestamp" = $last_timestamp AND "event"."id" < $last_event_id)
)
ORDER BY "@timestamp" DESC, "event"."id" DESC
LIMIT $page_size + 1;
```

### For Ascending Sort (`order = 'asc'`):
```sql
WHERE (
  "@timestamp" > $last_timestamp
  OR ("@timestamp" = $last_timestamp AND "event"."id" > $last_event_id)
)
ORDER BY "@timestamp" ASC, "event"."id" ASC
LIMIT $page_size + 1;
```

### Next Page Determination:
The engine requests `page_size + 1` rows.
- If $N + 1$ rows are returned: `has_more = true`, the $N$-th row supplies `(last_timestamp, last_event_id)` for the next cursor, and the $(N+1)$-th row is omitted from the response.
- If $\le N$ rows are returned: `has_more = false`, and `next_cursor = null`.

This approach provides $O(1)$ cursor advancement without scanning previous pages.
