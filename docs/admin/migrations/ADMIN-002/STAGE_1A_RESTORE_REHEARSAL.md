# Skyra LogHub — Stage 1A Isolated Restore Rehearsal

**Document ID:** `LOGHUB-ADMIN-002-STAGE-1A-RESTORE-REHEARSAL`  
**Milestone:** `LOGHUB-ADMIN-002-GATE-B-STAGE-1A`  
**Phase:** Phase 4 — Administration Backend Foundation  
**Restoration Destination:** Isolated Disposable Database (`skyra_loghub_restore_rehearsal`)  
**Isolated Host & Port:** `127.0.0.1:5433`  
**Target Role:** `skyra_isolated_user`  
**Date:** 2026-10-28  

---

## 1. Destination Safety & Isolation Verification

Before executing `pg_restore`, isolation from the protected development database was confirmed:
- **Port Isolation:** Port `5433` verified via `pg_isready` (Protected instance is on port `5432`).
- **Data Directory Isolation:** Target cluster runs on independent data directory (`C:\Users\jetti\.gemini\antigravity-ide\brain\...\scratch\isolated_pg_18_data`).
- **Database Safety Guard:** Target database `skyra_loghub_restore_rehearsal` is a clean, disposable database created specifically for this rehearsal. Protected database `skyra_loghub_dev` was strictly prohibited from being targeted.
- **Role Scoping:** Owned by `skyra_isolated_user`.

---

## 2. Restore Execution Parameters

| Parameter | Value |
| :--- | :--- |
| **Restore Utility** | `pg_restore (PostgreSQL) 18.0` |
| **Source Backup File** | `C:\Users\jetti\.gemini\antigravity-ide\brain\...\backups\skyra_loghub_dev_pre_admin002_20261028051943.dump` |
| **Backup SHA-256** | `1FA688AD20ECDC6EBF4CBCE5B1F257CEE3BE0DD08F76412FB32ACA83955D7CA2` |
| **Execution Command** | `pg_restore -h 127.0.0.1 -p 5433 -U skyra_isolated_user -d skyra_loghub_restore_rehearsal --no-owner --role=skyra_isolated_user --exit-on-error <backupFile>` |
| **Start Time (UTC)** | `2026-10-28T05:19:45.073Z` |
| **Completion Time (UTC)** | `2026-10-28T05:19:45.278Z` |
| **Duration** | 205 ms |
| **Exit Code** | `0` (Success) |
| **Errors / Warnings** | **None (0 errors, 0 warnings)** |

---

## 3. Post-Restore Schema Verification

A catalog query against `skyra_loghub_restore_rehearsal` on port 5433 confirmed:
- **Base Tables (8):** `_prisma_migrations`, `archive_segments`, `deduplication_receipts`, `ingestion_checkpoints`, `ingestion_credentials`, `project_quotas`, `projects`, `tenants`.
- **Enums (2):** `TenantStatus` (`ACTIVE`, `SUSPENDED`, `DECOMMISSIONED`), `ProjectStatus` (`ACTIVE`, `SUSPENDED`, `ARCHIVED`).
- **Constraints (79):** Primary keys, foreign keys, not-null constraints, and unique constraints created with zero omissions.
- **Indexes (16):** All B-Tree indexes restored and active.
- **Prisma Migrations Ledger:** Exactly 1 row restored (`20261024000000_init_metadata`, `rolled_back_at IS NULL`).

---

## 4. Rehearsal Outcome

The restore rehearsal succeeded with zero errors, zero warnings, and 100% schema reproduction in under 250 milliseconds.
This proves that the logical backup artifact is functionally restorable into a PostgreSQL 18 cluster.
