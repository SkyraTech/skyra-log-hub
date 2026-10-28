# Skyra LogHub — Quotas & Retention Architecture

**Document Version:** 1.0.0  
**Status:** Approved Architecture Specification  
**Task ID:** `LOGHUB-ADMIN-001`  
**Phase:** Phase 4 — Administration Backend Foundation  
**Date:** 2026-10-28  

---

## 1. Project Ingestion Quota Enforcement

In Skyra LogHub, a quota is not an abstract database record; it is directly coupled to runtime admission gates in `apps/ingestion-gateway`.

### 1.1 Quota Specification & Enforcement Mapping

| Quota Metric | Database Field (`project_quotas`) | Default Value | Enforcement Component | Enforcement Timing & Behavior |
|---|---|:---:|---|---|
| **Max Batch Size** | `maxBatchSize` | 500 events | `BatchValidationPipe` | Evaluates `events.length`. Rejects with `400 BATCH_OVERSIZED` if exceeded. |
| **Max Payload Bytes** | `maxPayloadBytes` | 5,242,880 (5 MiB) | Fastify Payload Limit | Terminates connection with `413 PAYLOAD_TOO_LARGE` before memory allocation. |
| **Max Events / Sec** | `maxEventsPerSec` | 5,000 eps | `RateLimitGuard` | In-memory token bucket per credential. Returns `429 RATE_LIMIT_EXCEEDED`. |

### 1.2 Administrative Mutation Semantics
- Administrators modify quotas via `PATCH /admin/v1/projects/{projectId}/quotas`.
- **Propagation:** Quota changes are written directly to PostgreSQL. The Ingestion Gateway's quota caching layer uses a short TTL (30 seconds) or listens for PostgreSQL `LISTEN/NOTIFY` cache invalidation signals.
- Changes take effect on the very next admitted batch following cache invalidation.

---

## 2. Retention Administration Architecture

### 2.1 Current Implementation vs. Administrative Contract
- **Phase 2 Baseline:** The storage compactor and shipper currently operate with a baseline **30-day retention period**.
- **Admin Configuration Objective:** Allow authorized tenant administrators to configure retention windows between **1 day and 365 days** on a per-project basis.

### 2.2 Retention Model Schema Proposal
```prisma
model ProjectRetentionPolicy {
  id              String   @id @default(uuid()) @db.Uuid
  tenantId        String   @map("tenant_id") @db.Uuid
  projectId       String   @unique @map("project_id") @db.VarChar(64)
  retentionDays   Int      @default(30) @map("retention_days")
  enableParquetPurge Boolean @default(true) @map("enable_parquet_purge")
  isLegalHold     Boolean  @default(false) @map("is_legal_hold")
  updatedAt       DateTime @updatedAt @map("updated_at") @db.Timestamptz
  updatedByUserId String   @map("updated_by_user_id") @db.Uuid

  tenant          Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  project         Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@map("project_retention_policies")
}
```

### 2.3 Safeguards Against Destructive Data Loss
Reducing retention duration (e.g. from 90 days to 7 days) causes irreversible deletion of historical log archives during the next compactor cycle. Therefore, the architecture enforces:
1. **Explicit Confirmation Header:** Decreasing `retentionDays` requires the caller to send `X-Confirm-Destructive-Action: true` and input the target project ID in a confirmation payload.
2. **Legal Hold Override:** When `isLegalHold = true`, all automated deletion sweeps by the background compactor are strictly inhibited regardless of `retentionDays`.
3. **Decoupled Deletion:** The Admin API merely updates the policy metadata; physical file unlinking is executed asynchronously by the Storage Compactor worker with detailed audit receipts.
