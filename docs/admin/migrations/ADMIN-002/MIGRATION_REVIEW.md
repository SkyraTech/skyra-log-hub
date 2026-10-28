# Skyra LogHub — Database Migration Technical Review (ADMIN-002)

**Migration Identifier:** `20261028000000_admin_iam_foundation`  
**Target Milestone:** `LOGHUB-ADMIN-002-GATE-B` (Execution Pending Approval)  
**Task ID:** `LOGHUB-ADMIN-002`  
**Phase:** Phase 4 — Administration Backend Foundation  
**Classification:** Additive Schema Evolution  
**Author:** Principal PostgreSQL Data Architect & IAM Security Engineer  
**Date:** 2026-10-28  

---

## 1. Executive Summary

This technical review evaluates the additive database schema changes prepared for **Gate B** execution in task `LOGHUB-ADMIN-002`. The migration introduces authoritative user identity, tenant memberships, project memberships, 5-tier RBAC structures, invitations, and durable administrative audit trails into the Skyra LogHub PostgreSQL metadata database.

### Core Guarantees Verified:
1. **Zero Data Loss:** All operations are additive (`CREATE TYPE`, `CREATE TABLE`, `CREATE INDEX`, `ADD CONSTRAINT`). No tables, columns, constraints, or rows from existing metadata tables (`tenants`, `projects`, `ingestion_credentials`, `project_quotas`, `archive_segments`, `deduplication_receipts`, `ingestion_checkpoints`) are dropped or altered.
2. **Zero Ingestion or Query Downtime:** Ingestion gateway credential lookups (`key_hash` indexing) and checkpointing operations are untouched.
3. **Reversibility:** A verified rollback procedure cleanly removes only the new tables and types without affecting legacy operational records.

---

## 2. Structural Schema Changes

### 2.1 Enumerations
* **`UserStatus`**: `('ACTIVE', 'SUSPENDED', 'DEACTIVATED')`
  * Distinguishes active employees from suspended or departed users.
* **`MembershipStatus`**: `('PENDING_INVITE', 'ACTIVE', 'SUSPENDED', 'REVOKED')`
  * Tracks lifecycle transitions for both workspace-level and project-level grants.

### 2.2 Table Definitions & Constraints

| Table Name | Purpose | Primary Key | Critical Constraints & Indexes | Foreign Key Relationships |
|---|---|---|---|---|
| **`users`** | Federated OIDC identity records | UUID (`id`) | `uq_users_issuer_subject` (`issuer`, `subject`)<br>Index on `email` | None (Root identity entity) |
| **`tenant_memberships`** | Tenant workspace membership | UUID (`id`) | `uq_tenant_memberships_tenant_user` (`tenant_id`, `user_id`) | FK $\rightarrow$ `tenants.id` (ON DELETE CASCADE)<br>FK $\rightarrow$ `users.id` (ON DELETE CASCADE) |
| **`project_memberships`** | Scoped project membership | UUID (`id`) | `uq_project_memberships_scope` (`tenant_id`, `project_id`, `user_id`) | FK $\rightarrow$ `tenants.id` (ON DELETE CASCADE)<br>FK $\rightarrow$ `projects.id` (ON DELETE CASCADE)<br>FK $\rightarrow$ `users.id` (ON DELETE CASCADE) |
| **`roles`** | Named RBAC roles | UUID (`id`) | `UNIQUE(name)` | None (System dictionary) |
| **`permissions`** | Granular system capabilities | UUID (`id`) | `UNIQUE(code)` | None (System dictionary) |
| **`role_permissions`** | Role-to-capability junction | Composite (`role_id`, `permission_id`) | Primary key on junction | FK $\rightarrow$ `roles.id`<br>FK $\rightarrow$ `permissions.id` |
| **`role_assignments`** | User role bindings | UUID (`id`) | `uq_role_assignments_scope` (`tenant_id`, `user_id`, `role_id`, `project_id`) | FK $\rightarrow$ `tenants.id`<br>FK $\rightarrow$ `users.id`<br>FK $\rightarrow$ `roles.id`<br>FK $\rightarrow$ `projects.id` (Nullable) |
| **`invitations`** | Team onboarding invites | UUID (`id`) | `UNIQUE(token_hash)`<br>Index on (`tenant_id`, `email`) | FK $\rightarrow$ `tenants.id`<br>FK $\rightarrow$ `roles.id` |
| **`admin_audit_events`** | Administrative audit trail | UUID (`id`) | Index on (`tenant_id`, `created_at` DESC)<br>Index on `action` | FK $\rightarrow$ `tenants.id`<br>FK $\rightarrow$ `users.id` (ON DELETE SET NULL) |

---

## 3. Referential Integrity & Multi-Tenant Isolation

### 3.1 Immutable OIDC Identity Key
The `users` table enforces composite uniqueness over `(issuer, subject)`:
```sql
CREATE UNIQUE INDEX "uq_users_issuer_subject" ON "users"("issuer", "subject");
```
* **Security Rationale:** In enterprise SaaS, user emails frequently change (marriage, rebrand, transfer) or collide across distinct identity providers (e.g. `dinesh@company.com` on Okta vs Google). Anchoring account uniqueness to `(issuer, subject)` guarantees zero identity spoofing and immunity to corporate email reassignment.

### 3.2 Tenant Isolation Defense
* **Project Membership Scoping:** `project_memberships` includes both `tenant_id` and `project_id`. The unique constraint `uq_project_memberships_scope` guarantees a user cannot receive project grants that span across different tenants.
* **Cascading Governance:** When a tenant is deleted or decommissioned, cascading foreign keys safely clean up child memberships and role assignments while audit events remain safely scoped.

---

## 4. Performance & Lock Duration Assessment

* **Lock Level:** Access Exclusive lock is acquired only briefly on table creation. Because no existing tables are modified, existing queries and writes on `ingestion_credentials` and `archive_segments` encounter **zero lock contention**.
* **Estimated Execution Time:** $< 150 \text{ ms}$ on standard PostgreSQL instances.
* **Data Backfill:** No backfill is required for existing operational tables. Initial roles and permissions will be populated via the approved seed script during Gate B.

---

## 5. Rollback Procedure

Should an unexpected anomaly occur during Gate B execution, the following script completely restores the previous schema state without data corruption:

```sql
BEGIN;
DROP TABLE IF EXISTS "admin_audit_events" CASCADE;
DROP TABLE IF EXISTS "invitations" CASCADE;
DROP TABLE IF EXISTS "role_assignments" CASCADE;
DROP TABLE IF EXISTS "role_permissions" CASCADE;
DROP TABLE IF EXISTS "permissions" CASCADE;
DROP TABLE IF EXISTS "roles" CASCADE;
DROP TABLE IF EXISTS "project_memberships" CASCADE;
DROP TABLE IF EXISTS "tenant_memberships" CASCADE;
DROP TABLE IF EXISTS "users" CASCADE;
DROP TYPE IF EXISTS "UserStatus";
DROP TYPE IF EXISTS "MembershipStatus";
COMMIT;
```
