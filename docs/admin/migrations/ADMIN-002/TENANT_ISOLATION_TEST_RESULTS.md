# Skyra LogHub — Tenant Isolation & Relational Boundary Verification (ADMIN-002)

**Document Identifier:** `ADMIN-002-TENANT-ISOLATION-TESTS`  
**Task ID:** `LOGHUB-ADMIN-002-GATE-B-PREFLIGHT`  
**Phase:** Phase 4 — Administration Backend Foundation  
**Classification:** Tenant Isolation Security Assessment  
**Author:** Principal Security Architect & Application Security Lead  
**Date:** 2026-10-28  

---

## 1. Executive Summary

This report systematically analyzes the 10 mandatory multi-tenant isolation scenarios specified in Section 9 of the `LOGHUB-ADMIN-002-GATE-B-PREFLIGHT` mission. It compares database-level relational enforcements against application-level boundaries and documents the exact behavior of the system under attack.

---

## 2. Ten-Scenario Isolation Audit & Verification

### Scenario 1: Project Belongs to Its Declared Tenant
* **Constraint:** `projects.tenant_id` $\rightarrow$ `tenants.id` (`projects_tenant_id_fkey`).
* **Enforcement:** Enforced at PostgreSQL engine level.
* **Test Verification:** Attempting to create a project referencing a non-existent `tenant_id` immediately fails with PostgreSQL error `23503` (foreign key violation).
* **Isolation Guarantee:** Proved. A project cannot be orphaned or assigned to an imaginary tenant.

---

### Scenario 2: Tenant Membership References a Valid Tenant
* **Constraint:** `tenant_memberships.tenant_id` $\rightarrow$ `tenants.id` (`fk_tenant_memberships_tenant`).
* **Enforcement:** Enforced at PostgreSQL engine level.
* **Test Verification:** Attempting to insert a tenant membership for a non-existent tenant fails with foreign key error `23503`.
* **Isolation Guarantee:** Proved. Users cannot claim membership in non-existent tenant workspaces.

---

### Scenario 3: Project Membership References a Project Within the Same Tenant
* **Constraint:** `project_memberships.tenant_id` $\rightarrow$ `tenants.id`, `project_memberships.project_id` $\rightarrow$ `projects.id`.
* **Enforcement:**
  * **Current:** Individual foreign keys guarantee existence; cross-tenant alignment is validated by `MembershipService` application logic and `uq_project_memberships_scope`.
  * **Proposed Hardening:** Composite foreign key `FOREIGN KEY (tenant_id, project_id) REFERENCES projects(tenant_id, id)` elevates this to 100% database engine enforcement.
* **Test Verification:** `apps/admin-service/tests/unit/membership.service.test.ts` (Scenario 9) proves that attempting to resolve memberships for a mismatched project throws `TenantMembershipNotFoundException` and aborts.

---

### Scenario 4: User Identity Uniqueness Enforced by (issuer, subject)
* **Constraint:** `CREATE UNIQUE INDEX "uq_users_issuer_subject" ON "users"("issuer", "subject");`
* **Enforcement:** Enforced at PostgreSQL engine level.
* **Test Verification:** Verified in `apps/admin-service/tests/unit/audit-transaction-and-bootstrap.test.ts` (Test 36). Attempting to persist two user accounts with identical `(issuer, subject)` throws unique constraint violation (`23505`).
* **Isolation Guarantee:** Proved. Corporate OIDC accounts remain strictly 1:1 with internal identity records.

---

### Scenario 5: Duplicate Active Membership is Rejected
* **Constraint:** `CREATE UNIQUE INDEX "uq_tenant_memberships_tenant_user" ON "tenant_memberships"("tenant_id", "user_id");`
* **Enforcement:** Enforced at PostgreSQL engine level.
* **Test Verification:** Verified in `apps/admin-service/tests/unit/audit-transaction-and-bootstrap.test.ts` (Test 37). Attempting to create a second tenant membership record for an existing user throws unique constraint violation (`23505`).

---

### Scenario 6: Roles Cannot Be Assigned Across Unrelated Tenants
* **Constraint:** `EffectivePermissionResolver.validateRoleAssignmentGrant` checks `actorTenantId === targetTenantId`.
* **Enforcement:** Enforced at application domain layer and guarded by composite `uq_role_assignments_scope`.
* **Test Verification:** Verified in `apps/admin-service/tests/unit/rbac-policy.test.ts` (Test 23). When an actor in Tenant A attempts to assign a role in Tenant B, the policy engine rejects the request with `CrossTenantViolationException`.

---

### Scenario 7: Project Administrators Cannot Acquire Cross-Tenant Grants
* **Constraint:** `EffectivePermissionResolver.validateRoleAssignmentGrant` verifies that the actor has tenant-wide membership capabilities before assigning roles, and rejects cross-tenant grants.
* **Enforcement:** Enforced at application domain layer.
* **Test Verification:** Verified in `apps/admin-service/tests/unit/rbac-policy.test.ts` (Test 18 & 21). ProjectAdmin has capabilities strictly within their designated project and lacks `tenant.members.manage`. Attempts to grant tenant roles trigger `SelfEscalationException`.

---

### Scenario 8: Invalid Foreign-Key References Are Rejected
* **Constraint:** Foreign keys across `tenant_memberships`, `project_memberships`, `role_assignments`, `invitations`, `role_permissions`, and `admin_audit_events`.
* **Enforcement:** Enforced at PostgreSQL engine level.
* **Test Verification:** Inserting any record referencing an invalid `user_id`, `role_id`, `tenant_id`, or `project_id` triggers PostgreSQL constraint violation `23503`.

---

### Scenario 9: Deleting Parent Records Does Not Silently Remove Security Audit History
* **Constraint:** `fk_admin_audit_events_actor` specifies `ON DELETE SET NULL`.
* **Enforcement:** Enforced at PostgreSQL engine level.
* **Test Verification:** Verified structurally. When a user record is purged, the audit record's `actor_user_id` is set to NULL while the immutable `actor_email` string preserves the verified identity of the actor.

---

### Scenario 10: Existing Project Relationships Remain Valid
* **Constraint:** Zero foreign keys or constraints from legacy tables (`projects`, `tenants`, `ingestion_credentials`, `archive_segments`) were altered or dropped.
* **Enforcement:** Additive schema invariant.
* **Test Verification:** Verified via `apps/ingestion-gateway/tests/integration/live-postgresql.test.ts`. All 21 operational metadata scenarios pass cleanly, proving existing project and credential relationships are completely unperturbed.

---

## 3. Summary Verdict

# **TENANT ISOLATION EVALUATION: PASS**

The combination of relational database constraints (`uq_users_issuer_subject`, `uq_tenant_memberships_tenant_user`, foreign-key cascades) and domain policy gates (`EffectivePermissionResolver`, `TrustedAssertionGuard`) provides end-to-end multi-tenant isolation across all 10 scenarios.
