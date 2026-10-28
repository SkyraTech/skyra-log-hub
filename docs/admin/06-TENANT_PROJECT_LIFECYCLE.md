# Skyra LogHub — Tenant & Project Lifecycle Architecture

**Document Version:** 1.0.0  
**Status:** Approved Architecture Specification  
**Task ID:** `LOGHUB-ADMIN-001`  
**Phase:** Phase 4 — Administration Backend Foundation  
**Date:** 2026-10-28  

---

## 1. Tenant Lifecycle Management

The `Tenant` aggregate models customer and institutional account state across the entire Skyra LogHub platform.

```text
               ┌───────────────────────┐
               │    PROVISION TENANT   │
               └───────────┬───────────┘
                           ▼
               ┌───────────────────────┐
         ┌────>│        ACTIVE         │<────┐
         │     └───────────┬───────────┘     │
Admin    │                 │ Admin Suspends  │ Admin Reactivates
Reactivates                ▼                 │
         │     ┌───────────────────────┐     │
         └─────│       SUSPENDED       │─────┘
               └───────────┬───────────┘
                           │ Permanent Decommission
                           ▼
               ┌───────────────────────┐
               │    DECOMMISSIONED     │ (Terminal State)
               └───────────────────────┘
```

### 1.1 State Semantics & Downstream Effects
- **`ACTIVE`:** Normal operational posture.
  - Ingestion Gateway accepts logs for credentials tied to this tenant.
  - Query Service authorizes log search, aggregations, and facets.
  - Admin Service permits project creation, user management, and quota updates.
- **`SUSPENDED`:** Temporary freeze (e.g., billing delinquency, security incident).
  - Ingestion Gateway rejects incoming batches with `403 FORBIDDEN` (`TENANT_SUSPENDED`).
  - Query Service rejects queries with `403 FORBIDDEN`.
  - Admin Service restricts operations to OrgOwner inspection.
- **`DECOMMISSIONED`:** Permanent closure.
  - Ingestion Gateway rejects all traffic.
  - All machine credentials revoked immediately.
  - Archives transitioned to cold compliance storage or scheduled for certified deletion after legal retention expiration.

---

## 2. Project Lifecycle & Data Preservation

Projects represent logical logging namespaces (e.g. `auth-service`, `billing-gateway`).

### 2.1 State Transitions
- **`ACTIVE`:** Ingestion active, query active.
- **`SUSPENDED`:** Ingestion blocked, query active for historical investigation (marked read-only).
- **`ARCHIVED`:** Project decommissioned.
  - Ingestion permanently blocked. All machine credentials scoped to this project are disabled or revoked.
  - Historical JSONL and Parquet archives **remain preserved on disk/S3** until retention schedules purge them.
  - Query Service allows historical investigation if explicitly requested, displaying a prominent warning: `PROJECT_ARCHIVED`.

### 2.2 Rejection of Immediate Hard Deletion
A critical architectural decision is **preventing immediate hard deletion of project records** in PostgreSQL when historical archive segments exist on disk:
- **Data Integrity Risk:** Hard-deleting a `Project` row would cascade-delete foreign keys in `project_quotas`, but underlying filesystem archives (`archive_segments`, `.manifest.json`) and DuckDB query engines would be left orphaned with dangling project IDs.
- **Compliance & Forensics:** Enterprise audits require forensic traceability for at least the configured retention duration (e.g. 30–365 days).
- **Policy:** The administration API provides `PATCH /admin/v1/tenants/{tenantId}/projects/{projectId}` with `{ "status": "ARCHIVED" }`. Physical purge of archive files occurs exclusively through the automated background compactor/retention service (`LOGHUB-RETENTION-001`).

---

## 3. Downstream Service Impact Matrix

| Operation | Ingestion Gateway | Storage Shipper / WAL | Query Service | Console BFF |
|---|---|---|---|---|
| **Create Project** | Admitted once credential exists | Allocates journal offsets | Discovers new segments | Discovers in project picker |
| **Suspend Project** | Rejects logs (`403 PROJECT_SUSPENDED`) | Flushes existing in-flight WAL | Allows historical queries | Marks project with warning badge |
| **Archive Project** | Rejects logs (`403 PROJECT_ARCHIVED`) | Shuts down project buffers | Read-only historical query | Hides from default active picker |
| **Suspend Tenant** | Rejects all batches (`403 TENANT_SUSPENDED`) | Halts shipper tasks | Rejects all queries (`403`) | Locks session to billing screen |
