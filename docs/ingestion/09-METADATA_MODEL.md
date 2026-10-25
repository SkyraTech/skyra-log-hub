# Skyra LogHub — Operational Metadata Model & Reconciliation

**Document ID:** `LOGHUB-DOC-ING-009`  
**Task Reference:** `LOGHUB-ING-001A`  
**Phase:** Phase 2 (Centralized Ingestion)  
**Status:** Architecture Specification & Baseline  
**Architecture Reference:** ADR-004, ADR-011, ADR-014, ADR-015

---

## 1. Storage Classification & Ground Truth Hierarchy

Skyra LogHub enforces strict data classification to ensure that the relational database never becomes a single point of telemetry loss:

```
+-------------------------------------------------------------------------+
| AUTHORITATIVE GROUND TRUTH                                              |
| 1. Write-Ahead Journal (WAL): Unfinalized in-flight telemetry batches   |
| 2. Central Archive Segments (.jsonl): Permanent immutable raw events    |
| 3. Segment Manifests (.manifest.json): Cryptographic proofs & ranges   |
+-------------------------------------------------------------------------+
                                     |
                                     v (Derives / Reconstructs)
+-------------------------------------------------------------------------+
| OPERATIONAL METADATA & REBUILDABLE INDEXES (PostgreSQL)                 |
| - Ingestion Credentials (Projects, Environments, Key Hashes)            |
| - Archive Segment Catalog (Partition index for DuckDB query optimizer)  |
| - Deduplication Receipts (7-day fast lookup index for duplicate checks) |
| - Ingestion Checkpoints (WAL replay offset watermarks)                  |
+-------------------------------------------------------------------------+
                                     |
                                     v (Populates)
+-------------------------------------------------------------------------+
| OPTIONAL PERFORMANCE ACCELERATORS (Valkey / Redis)                      |
| - Ephemeral Rate Limiting Counters (Sliding Window)                     |
| - Volatile Sub-Millisecond Replay Cache (24-Hour TTL)                   |
+-------------------------------------------------------------------------+
```

---

## 2. PostgreSQL Relational Model (Prisma Schema DDL)

```prisma
// Prisma Schema for LogHub Ingestion Metadata

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

/// Ingestion machine credentials for servers, shippers, and proxies
model IngestionCredential {
  id                 String    @id @default(uuid()) @db.Uuid
  tenantId           String    @map("tenant_id") @db.VarChar(64)
  keyHash            String    @unique @map("key_hash") @db.VarChar(64)
  keyPrefix          String    @map("key_prefix") @db.VarChar(24)
  description        String    @db.VarChar(255)
  allowedProjects    String[]  @map("allowed_projects")
  allowedEnvironments String[] @map("allowed_environments")
  rateLimitPerMin    Int       @default(600) @map("rate_limit_per_minute")
  createdAt          DateTime  @default(now()) @map("created_at") @db.Timestamptz
  expiresAt          DateTime  @map("expires_at") @db.Timestamptz
  isRevoked          Boolean   @default(false) @map("is_revoked")
  lastUsedAt         DateTime? @map("last_used_at") @db.Timestamptz

  @@index([tenantId])
  @@map("ingestion_credentials")
}

/// Catalog of finalized immutable archive segments
model ArchiveSegment {
  id                   String   @id @default(uuid()) @db.Uuid
  tenantId             String   @map("tenant_id") @db.VarChar(64)
  projectId            String   @map("project_id") @db.VarChar(64)
  environment          String   @db.VarChar(32)
  serviceName          String   @map("service_name") @db.VarChar(64)
  date                 String   @db.VarChar(10) // YYYY-MM-DD
  segmentFilename      String   @map("segment_filename") @db.VarChar(64)
  recordCount          Int      @map("record_count")
  byteSize             BigInt   @map("byte_size")
  sha256Checksum       String   @map("sha256_checksum") @db.VarChar(64)
  firstEventTimestamp  DateTime @map("first_event_timestamp") @db.Timestamptz
  lastEventTimestamp   DateTime @map("last_event_timestamp") @db.Timestamptz
  finalizedAt          DateTime @map("finalized_at") @db.Timestamptz
  writerInstanceId     String   @map("writer_instance_id") @db.VarChar(128)
  journalSegmentId     String   @map("journal_segment_id") @db.VarChar(64)
  journalStartOffset   BigInt   @map("journal_start_offset")
  journalEndOffset     BigInt   @map("journal_end_offset")

  @@unique([tenantId, projectId, environment, serviceName, date, segmentFilename])
  @@index([tenantId, projectId, date])
  @@map("archive_segments")
}

/// Durable deduplication receipts (retained for 7 days)
model DeduplicationReceipt {
  id             String   @id @default(uuid()) @db.Uuid
  tenantId       String   @map("tenant_id") @db.VarChar(64)
  projectId      String   @map("project_id") @db.VarChar(64)
  batchId        String   @map("batch_id") @db.VarChar(64)
  contentDigest  String   @map("content_digest") @db.VarChar(71) // sha256:<hex_64>
  journalSegment String   @map("journal_segment") @db.VarChar(64)
  journalOffset  BigInt   @map("journal_offset")
  acceptedCount  Int      @map("accepted_count")
  committedAt    DateTime @default(now()) @map("committed_at") @db.Timestamptz
  expiresAt      DateTime @map("expires_at") @db.Timestamptz

  @@unique([tenantId, projectId, batchId])
  @@index([expiresAt])
  @@map("deduplication_receipts")
}

/// Watermark checkpoints for background consumers and compactor workers
model IngestionCheckpoint {
  id             String   @id @db.VarChar(64) // e.g. "archive_writer_primary"
  journalSegment String   @map("journal_segment") @db.VarChar(64)
  byteOffset     BigInt   @map("byte_offset")
  updatedAt      DateTime @updatedAt @map("updated_at") @db.Timestamptz

  @@map("ingestion_checkpoints")
}
```

---

## 3. Database Failure & Total Rebuild Protocol

Because PostgreSQL stores metadata rather than raw event bodies, a catastrophic database loss does not destroy telemetry data.

### Cold Rebuild Procedure
If the PostgreSQL database is dropped or corrupted:
1. **Re-apply Migrations:** Run `prisma migrate deploy` against the fresh database instance.
2. **Re-populate Credentials:** Re-seed machine credentials from secure enterprise secrets manager (e.g., Vault or AWS Secrets Manager).
3. **Archive Manifest Scan:**
   - Execute the CLI rebuild command: `skyra-admin rebuild-catalog --archive-root /var/loghub/archive`.
   - The tool scans all directory trees, reads every `segment-*.manifest.json`, and inserts corresponding rows into `archive_segments`.
4. **Journal WAL Scan:**
   - Execute: `skyra-admin rebuild-wal-state --journal-dir /var/loghub/wal`.
   - Reads un-archived journal segments, restores `deduplication_receipts` for active batches, and updates `ingestion_checkpoints`.
5. **Recovery Time Objective (RTO):** Total catalog rebuild executes at >10,000 segment manifests per second, restoring normal operation in under 2 minutes.
