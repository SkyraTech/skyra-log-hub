# Skyra LogHub — Stage 1A Data & Schema Integrity Comparison

**Document ID:** `LOGHUB-ADMIN-002-STAGE-1A-DATA-INTEGRITY`  
**Milestone:** `LOGHUB-ADMIN-002-GATE-B-STAGE-1A`  
**Phase:** Phase 4 — Administration Backend Foundation  
**Comparison Source:** Protected Development Database (`skyra_loghub_dev` on `127.0.0.1:5432`)  
**Comparison Target:** Restored Disposable Database (`skyra_loghub_restore_rehearsal` on `127.0.0.1:5433`)  
**Date:** 2026-10-28  

---

## 1. Schema & Object Parity Matrix

A normalized, side-by-side comparison was executed across the PostgreSQL database catalogs:

| Schema Dimension | Source (`skyra_loghub_dev`:5432) | Restored (`restore_rehearsal`:5433) | Match Result | Discrepancies |
| :--- | :--- | :--- | :--- | :--- |
| **Base Tables** | 8 tables (`_prisma_migrations`, `archive_segments`, `deduplication_receipts`, `ingestion_checkpoints`, `ingestion_credentials`, `project_quotas`, `projects`, `tenants`) | 8 tables (`_prisma_migrations`, `archive_segments`, `deduplication_receipts`, `ingestion_checkpoints`, `ingestion_credentials`, `project_quotas`, `projects`, `tenants`) | **MATCH (100%)** | None |
| **Columns** | 71 columns across 8 tables | 71 columns across 8 tables | **MATCH (100%)** | None |
| **Column Data Types** | Identical (UUID, VarChar, BigInt, Timestamptz, JsonB, Enums) | Identical | **MATCH (100%)** | None |
| **Nullability Rules** | Identical across all 71 columns | Identical | **MATCH (100%)** | None |
| **Enums & Labels** | 2 enums (`ProjectStatus` [3 labels], `TenantStatus` [3 labels]) | 2 enums (`ProjectStatus` [3 labels], `TenantStatus` [3 labels]) | **MATCH (100%)** | None |
| **Constraints** | 79 constraints in `public` | 79 constraints in `public` | **MATCH (100%)** | None |
| **Indexes** | 16 B-Tree indexes | 16 B-Tree indexes | **MATCH (100%)** | None |
| **Migration History** | 1 entry: `20261024000000_init_metadata` | 1 entry: `20261024000000_init_metadata` | **MATCH (100%)** | None |

---

## 2. Table-by-Table Data & Row Count Integrity

Row count integrity checks were executed across all operational tables:

| Table Name | Source Row Count | Restored Row Count | Match Result |
| :--- | :--- | :--- | :--- |
| `_prisma_migrations` | 1 | 1 | **MATCH** |
| `archive_segments` | 0 | 0 | **MATCH** |
| `deduplication_receipts` | 0 | 0 | **MATCH** |
| `ingestion_checkpoints` | 0 | 0 | **MATCH** |
| `ingestion_credentials` | 0 | 0 | **MATCH** |
| `project_quotas` | 0 | 0 | **MATCH** |
| `projects` | 0 | 0 | **MATCH** |
| `tenants` | 0 | 0 | **MATCH** |

---

## 3. Existing Service Metadata Compatibility

Using read-only queries against `skyra_loghub_restore_rehearsal`:
1. **Ingestion Gateway Queries:**
   - Evaluated credential lookup query structure: `SELECT * FROM ingestion_credentials WHERE key_hash = $1`. Succeeded with valid schema types.
   - Evaluated quota lookup: `SELECT * FROM project_quotas WHERE tenant_id = $1 AND project_id = $2`. Succeeded.
2. **Query Service Queries:**
   - Evaluated archive segment discovery: `SELECT * FROM archive_segments WHERE tenant_id = $1 AND project_id = $2`. Succeeded.
3. **Prisma Client Compatibility:**
   - Tested reading `_prisma_migrations` via Prisma model definition. Succeeded.

---

## 4. Protected Database Postflight Verification

After the restore rehearsal, the protected source database `skyra_loghub_dev` was re-queried:
- **Table Count:** Exactly 8 tables (Unchanged).
- **Admin Tables:** 0 (Unchanged).
- **Mutation Verification:** Zero records altered, zero DDL executed.
- **Verdict:** Source database remained strictly read-only and unpolluted.
