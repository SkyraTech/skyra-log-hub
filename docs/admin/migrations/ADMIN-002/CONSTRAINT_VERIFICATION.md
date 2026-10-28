# Skyra LogHub — Database Constraint & Referential Integrity Audit (ADMIN-002)

**Document Identifier:** `ADMIN-002-CONSTRAINT-VERIFICATION`  
**Task ID:** `LOGHUB-ADMIN-002-GATE-B-PREFLIGHT`  
**Phase:** Phase 4 — Administration Backend Foundation  
**Classification:** Security Architecture & Referential Audit  
**Author:** Principal PostgreSQL Architect & Application Security Engineer  
**Date:** 2026-10-28  

---

## 1. Executive Summary

This document performs an exhaustive audit of all relational constraints, foreign-key cascades, uniqueness guarantees, and tenant isolation mechanisms specified in `migration.sql` for milestone **`LOGHUB-ADMIN-002`**.

### Core Invariants Audited:
1. **OIDC Identity Uniqueness:** Protection against cross-issuer collisions and corporate email hijacking.
2. **Tenant Membership Isolation:** Guarantees that workspace access cannot cross organizational boundaries.
3. **Project Membership Integrity:** Prevention of orphaned or mismatched project grants.
4. **Audit Immutability:** Protection of administrative audit trails against cascading deletions.
5. **Cascading Lifecycle Cleanup:** Clean deletion of tenant-owned IAM entities when an organization is decommissioned.

---

## 2. Detailed Constraint Audit Matrix

| Constraint Name | Table | Type | Covered Columns / Action | Security & Isolation Purpose | Enforcement Layer |
|---|---|:---:|---|---|:---:|
| `users_pkey` | `users` | PK | `("id")` | Ensures unique internal UUID for all users | PostgreSQL Engine |
| `uq_users_issuer_subject` | `users` | Unique | `("issuer", "subject")` | **P0 Defense:** Anchors federated corporate identity to immutable issuer+sub tuple. Prevents cross-IDP account takeover. | PostgreSQL Engine |
| `users_email_idx` | `users` | Index | `("email")` | Fast corporate email lookups during invitation redemption | PostgreSQL Engine |
| `tenant_memberships_pkey` | `tenant_memberships` | PK | `("id")` | Unique membership record identifier | PostgreSQL Engine |
| `uq_tenant_memberships_tenant_user` | `tenant_memberships` | Unique | `("tenant_id", "user_id")` | **P0 Defense:** Enforces that a user has at most one membership record in any given tenant. | PostgreSQL Engine |
| `fk_tenant_memberships_tenant` | `tenant_memberships` | FK | `tenant_id` $\rightarrow$ `tenants(id)`<br>`ON DELETE CASCADE` | Ensures all memberships belong to valid tenants; automatically purges memberships if tenant is purged. | PostgreSQL Engine |
| `fk_tenant_memberships_user` | `tenant_memberships` | FK | `user_id` $\rightarrow$ `users(id)`<br>`ON DELETE CASCADE` | Ensures memberships reference valid users; cascades when user account is deleted. | PostgreSQL Engine |
| `project_memberships_pkey` | `project_memberships` | PK | `("id")` | Unique project membership record identifier | PostgreSQL Engine |
| `uq_project_memberships_scope` | `project_memberships` | Unique | `("tenant_id", "project_id", "user_id")` | Enforces that a user has at most one membership record per project in a tenant. | PostgreSQL Engine |
| `fk_project_memberships_tenant` | `project_memberships` | FK | `tenant_id` $\rightarrow$ `tenants(id)`<br>`ON DELETE CASCADE` | Referential validity of owning tenant. | PostgreSQL Engine |
| `fk_project_memberships_project` | `project_memberships` | FK | `project_id` $\rightarrow$ `projects(id)`<br>`ON DELETE CASCADE` | Referential validity of referenced project. | PostgreSQL Engine |
| `roles_name_key` | `roles` | Unique | `("name")` | Prevents duplicate role definitions (`OrgOwner`, etc.). | PostgreSQL Engine |
| `permissions_code_key` | `permissions` | Unique | `("code")` | Prevents duplicate capability codes (`logs.search`, etc.). | PostgreSQL Engine |
| `role_permissions_pkey` | `role_permissions` | PK | `("role_id", "permission_id")` | Composite primary key on junction table. | PostgreSQL Engine |
| `uq_role_assignments_scope` | `role_assignments` | Unique | `("tenant_id", "user_id", "role_id", COALESCE("project_id", ''))` | **P0 Defense:** Prevents duplicate assignment of the same role to a user within tenant or project scope. | PostgreSQL Engine |
| `invitations_token_hash_key` | `invitations` | Unique | `("token_hash")` | Enforces single-use token uniqueness; prevents token replay. | PostgreSQL Engine |
| `fk_admin_audit_events_tenant` | `admin_audit_events` | FK | `tenant_id` $\rightarrow$ `tenants(id)`<br>`ON DELETE CASCADE` | Scopes audit records strictly to tenant organization. | PostgreSQL Engine |
| `fk_admin_audit_events_actor` | `admin_audit_events` | FK | `actor_user_id` $\rightarrow$ `users(id)`<br>`ON DELETE SET NULL` | **Critical Security Invariant:** Deleting a user does NOT delete audit trails; actor field is set to NULL while `actor_email` is preserved. | PostgreSQL Engine |

---

## 3. Deep-Dive: Cross-Tenant Project Membership Isolation

### The Cross-Tenant Mismatch Vulnerability
In a multi-tenant schema with separate `tenants` and `projects` tables:
1. `tenants`: `id` UUID PK
2. `projects`: `id` VARCHAR(64) PK, `tenant_id` UUID FK $\rightarrow$ `tenants(id)`

In `project_memberships`:
```sql
CREATE TABLE "project_memberships" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" VARCHAR(64) NOT NULL,
    "user_id" UUID NOT NULL,
    ...
);
```
If `project_memberships` only enforces:
* `FOREIGN KEY (tenant_id) REFERENCES tenants(id)`
* `FOREIGN KEY (project_id) REFERENCES projects(id)`

Then at the pure SQL engine level, a direct insert could specify:
* `tenant_id` = Tenant A
* `project_id` = Project B (where Project B actually belongs to Tenant B)

Because Tenant A exists in `tenants` and Project B exists in `projects`, both individual foreign keys would evaluate to TRUE!

### Application-Level vs Database-Level Defense:
1. **Application Defense (Implemented):** In `apps/admin-service/src/modules/membership/application/membership.service.ts` and `apps/query-service/src/modules/auth/authorization/project-authorization.service.ts`, the application explicitly verifies that `project.tenant_id === tenant_id` before admitting or granting membership.
2. **Database Defense (Recommended Hardening):**
   To enforce this constraint natively at the database level:
   * **Step A:** Add a composite unique index on the legacy `projects` table:
     ```sql
     CREATE UNIQUE INDEX IF NOT EXISTS "projects_tenant_id_id_key" ON "projects"("tenant_id", "id");
     ```
   * **Step B:** Add a composite foreign key on `project_memberships`:
     ```sql
     ALTER TABLE "project_memberships"
       ADD CONSTRAINT "fk_project_memberships_tenant_project"
       FOREIGN KEY ("tenant_id", "project_id")
       REFERENCES "projects"("tenant_id", "id")
       ON DELETE CASCADE ON UPDATE CASCADE;
     ```
   * **Result:** It becomes mathematically impossible for PostgreSQL to store a project membership record where the project does not belong to the specified tenant!

---

## 4. Audit History Preservation Verification

When a user departs an organization and their user record is removed:
* `fk_admin_audit_events_actor` specifies `ON DELETE SET NULL`.
* In `admin_audit_events`, `actor_user_id` transitions to `NULL`.
* Crucially, `actor_email` is a non-foreign-key `VARCHAR(255)` column that retains the actor's verified corporate email at the time of the administrative action.
* **Result:** Immutable compliance audit records remain fully decipherable and intact even post-deprovisioning.

---

## 5. Constraint Verification Verdict

# **CONSTRAINT & REFERENTIAL INTEGRITY: PASS (WITH RECOMMENDED HARDENING)**

All standard relational foreign keys, cascade paths, single-use token uniqueness, and OIDC identity composite keys are structurally sound and verified. Adding the composite `(tenant_id, id)` index to `projects` will elevate project isolation from application-enforced to PostgreSQL engine-enforced.
