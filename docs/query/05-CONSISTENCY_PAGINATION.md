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

### 2.2 4-Part Composite Deterministic Sort Locator (LOGHUB-QUERY-004 P0-B)
To guarantee 100% deterministic, non-shifting pagination even in the presence of identical timestamps or duplicate event IDs, the Query Service orders results by a 4-part composite locator tuple:
1. **Primary Sort Key:** `@timestamp` (ISO 8601 UTC timestamp).
2. **Secondary Tie-Breaker:** `event.id` (UUIDv4/UUIDv7 string).
3. **Tertiary Tie-Breaker:** `segment_id` (Physical archive segment filename, extracted via DuckDB `regexp_extract(filename, '([^/\\\\]+)$', 1)`).
4. **Quaternary Tie-Breaker:** `record_offset` (Physical 0-indexed line ordinal within the segment, derived via deterministic DuckDB window function `CAST(row_number() OVER (PARTITION BY filename ORDER BY json_extract_string(json, '$."@timestamp"'), json_extract_string(json, '$.event.id'), md5(json)) - 1 AS BIGINT)`).

This 4-tuple `(@timestamp, event.id, segment_id, record_offset)` is strictly unique across all files, gateway restarts, catalog scans, and **survives JSONL-to-Parquet materialization and transparent hybrid source substitution without cursor drift or pagination invalidation** (verified in LOGHUB-QUERY-006).

---

## 3. Cryptographic Opaque Cursor Design

### 3.1 Cursor Payload (`cursor.schema.json`)

Pagination cursors returned to the client are base64url-encoded, HMAC-SHA256 authenticated JSON structures:

```typescript
export interface QueryCursorPayload {
  version: 1;
  query_fingerprint: string;    // SHA-256 of canonicalized query parameters (binds filters)
  tenant_id: string;            // Tenant scope boundary
  authorized_projects: string[];// Project scope boundary
  sort_order: 'asc' | 'desc';
  position: {
    timestamp: string;          // ISO 8601 UTC timestamp
    event_id: string;           // Event ID
    segment_id: string;         // Segment filename
    record_offset: number;      // 0-indexed record ordinal within segment
  };
  created_at: number;           // Unix epoch ms
  expires_at: number;           // Unix epoch ms (TTL: 24 hours)
  key_id?: string;              // Signing key identifier for rotation
  signature: string;            // HMAC-SHA256(payload_bytes, SERVER_CURSOR_SECRET)
}
```

### 3.2 Security & Integrity Controls
- **Tamper-Proof:** Any modification to position tuple, tenant ID, or projects invalidates the HMAC signature, causing the query to fail with `400 Bad Request` (`INVALID_CURSOR`).
- **Filter Binding:** The cursor embeds `query_fingerprint` computed over the normalized search filters. If a client attempts to use a cursor generated for `log.level = 'error'` on a subsequent query for `log.level = 'info'`, the server detects the mismatch and rejects the cursor (`CURSOR_QUERY_MISMATCH`).
- **Tenant & Scope Binding:** If a principal attempts to replay a cursor belonging to another tenant or project, the server denies access (`CROSS_TENANT_CURSOR_REPLAY`).
- **Bounded Expiration:** Cursors expire after 24 hours (`expires_at`), preventing stale cursor accumulation and ensuring users query fresh catalog states.
- **Constant-Time Verification:** Signatures are compared using `crypto.timingSafeEqual` to avoid timing side channels.

---

## 4. Keyset SQL Execution Mechanics

When a valid cursor is provided, the SQL generator translates the 4-part position tuple into DuckDB inequality predicates:

### For Descending Sort (`order = 'desc'`):
```sql
WHERE (
  "@timestamp" < $last_timestamp
  OR ("@timestamp" = $last_timestamp AND "event.id" < $last_event_id)
  OR ("@timestamp" = $last_timestamp AND "event.id" = $last_event_id AND "segment_id" < $last_segment_id)
  OR ("@timestamp" = $last_timestamp AND "event.id" = $last_event_id AND "segment_id" = $last_segment_id AND "record_offset" < $last_record_offset)
)
ORDER BY "@timestamp" DESC, "event.id" DESC, "segment_id" DESC, "record_offset" DESC
LIMIT $page_size + 1;
```

### For Ascending Sort (`order = 'asc'`):
```sql
WHERE (
  "@timestamp" > $last_timestamp
  OR ("@timestamp" = $last_timestamp AND "event.id" > $last_event_id)
  OR ("@timestamp" = $last_timestamp AND "event.id" = $last_event_id AND "segment_id" > $last_segment_id)
  OR ("@timestamp" = $last_timestamp AND "event.id" = $last_event_id AND "segment_id" = $last_segment_id AND "record_offset" > $last_record_offset)
)
ORDER BY "@timestamp" ASC, "event.id" ASC, "segment_id" ASC, "record_offset" ASC
LIMIT $page_size + 1;
```

### Next Page Determination:
The engine requests `page_size + 1` rows (`fetchExtraRow: true`).
- If $N + 1$ rows are returned: `has_more = true`, the $N$-th row supplies `(timestamp, event_id, segment_id, record_offset)` for the next cursor, and the $(N+1)$-th row is trimmed from the response.
- If $\le N$ rows are returned: `has_more = false`, and `next_cursor = null`.

This approach provides $O(1)$ cursor advancement without scanning previous pages.

---

## 5. Byte-Identical Duplicate Handling & Hardening (LOGHUB-QUERY-007)

### 5.1 The Duplicate Record Challenge (P0-D)
In real-world ingestion, transient network retries or edge shipper errors can produce byte-identical duplicate events that share identical `@timestamp`, identical `event.id`, identical payload bodies, and reside within the exact same canonical segment.

In previous naive approaches, pagination queries relying solely on `(@timestamp, event.id)` or `md5(json)` would loop infinitely or skip records when paginating across duplicate boundaries because every duplicate row evaluated to identical keyset values.

### 5.2 Resolution via Deterministic Record Ordinals
Under LOGHUB-QUERY-007, the physical record ordinal `record_offset` is derived using DuckDB's deterministic window function:
```sql
CAST(row_number() OVER (
  PARTITION BY filename 
  ORDER BY 
    json_extract_string(json, '$."@timestamp"'), 
    json_extract_string(json, '$.event.id'), 
    md5(json)
) - 1 AS BIGINT) AS "record_offset"
```
Because `row_number()` strictly generates a monotonic sequence `0, 1, 2, ..., N-1` for every row in a partition (even if all columns and content hashes are identical), each duplicate event is guaranteed a unique, stable, deterministic `record_offset`.

### 5.3 Cross-Format Cursor Continuity
When JSONL segments are materialized to Parquet, DuckDB preserves the exact same tuple:
- In Parquet materialization, `record_offset` is persisted as an `INT64` physical column.
- In both JSONL and Parquet execution paths, the composite keyset tuple `(@timestamp, event.id, segment_id, record_offset)` produces byte-for-byte identical sorting sequences.
- Verified in `apps/query-service/tests/integration/stable-locator-duplicate-pagination.test.ts`:
  1. **P0-D1:** Complete exhaustive pagination of 5 duplicate records across multiple pages (page size = 2) returned 100% of rows with zero infinite loops and zero dropped rows.
  2. **P0-D2:** Parquet-only execution over identical duplicates matched JSONL ordering exactly.
  3. **P0-D3:** Cross-format cursor continuity verified: Page 1 retrieved from JSONL produced a cursor that was passed directly to a Parquet execution query, retrieving the exact expected remaining records seamlessly.

