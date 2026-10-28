# Skyra LogHub — Administration Testing & Acceptance Architecture

**Document Version:** 2.1.0  
**Status:** STAGE 1A VERIFIED (Backup & Recovery Rehearsed) — PENDING STAGE 1B HUMAN AUTHORIZATION  
**Task ID:** `LOGHUB-ADMIN-002-GATE-B-STAGE-1A`  
**Phase:** Phase 4 — Administration Backend Foundation  
**Date:** 2026-10-28  

---

## 1. Testing Strategy Overview

The testing framework for the Administration Backend spans:
1. **Isolated Unit Tests:** Pure domain entity policies (anti-escalation, last-owner invariant, permission resolution).
2. **Database Integration Tests:** PostgreSQL transactional tests with automatic rollback to verify composite unique constraints and foreign-key cascades.
3. **Contract & Schema Tests:** JSON Schema validation (Draft 2020-12) of all request/response DTOs against `contracts/admin/v1/`.
4. **Security & Negative Integration Tests:** Cross-tenant access rejection, tampered JWT detection, and unauthorized mutation denial.

---

## 2. 40-Scenario Quality Gate Test Matrix (Mandatory for ADMIN-002 / ADMIN-003)

### 2.1 Identity & Membership Scenarios (1–10)
1. **User Identity Resolution:** Resolves existing user by canonical `(issuer, subject)` composite key.
2. **Cross-Issuer Collision Protection:** Verifies that identical `subject` strings from different `issuer` URLs resolve to isolated user accounts.
3. **Tenant Membership Validation:** Admitted user possesses active `TenantMembership`; returns authorized workspaces.
4. **Project Membership Scoping:** Resolves specific project grants for assigned non-admin users.
5. **Membership Revocation:** Setting status to `REVOKED` terminates subsequent workspace token minting immediately.
6. **Suspended User Defense:** Setting `User.status = SUSPENDED` blocks all platform actions.
7. **Suspended Tenant Defense:** Setting `Tenant.status = SUSPENDED` rejects all project mutations and query executions.
8. **Archived Project Defense:** Setting `Project.status = ARCHIVED` disables credential authentication and issues query warning.
9. **Fail-Closed on IAM Partition:** When database or directory is unreachable, `resolveMemberships` fails closed with 503.
10. **Stale Permission Invalidation:** Role mutation emits cache-invalidation signal; subsequent request executes against fresh permissions.

### 2.2 RBAC & Permission Scenarios (11–20)
11. **OrgOwner Authorization:** OrgOwner executes tenant updates, user management, and credential operations across all projects.
12. **OrgAdmin Scoping:** OrgAdmin executes project provisioning and user management, but cannot delete tenant.
13. **ProjectAdmin Scoping:** ProjectAdmin can rotate keys and tune quotas for assigned projects, but is rejected on unassigned projects.
14. **Developer Role Enforcement:** Developer can search logs and view aggregations, but is rejected on credential creation (`403`).
15. **Viewer Role Enforcement:** Viewer can read dashboards, but is rejected on export downloads (`403`).
16. **Self-Escalation Rejection:** User cannot assign themselves a higher role or additional project grants.
17. **Cross-Tenant Role Assignment Denial:** Admin in Tenant A cannot assign roles to users in Tenant B.
18. **Last-Owner Removal Rejection:** Attempt to revoke or demote the sole remaining `OrgOwner` fails with `409 Conflict`.
19. **Inherited Project Permissions:** Tenant-wide role assignments grant implicit access to all projects within the tenant.
20. **Deny-by-Default Invariant:** Request with no matching permission grant fails closed (`403 Forbidden`).

### 2.3 Credential Lifecycle Scenarios (21–30)
21. **Credential Generation:** Creates credential; returns raw token matching `skyra_live_[a-f0-9]{64}`.
22. **One-Time Secret Reveal:** Raw token is present in creation response body; absent in subsequent GET requests.
23. **Verifier Integrity:** Generated `key_hash` in PostgreSQL equals `crypto.createHash('sha256').update(rawToken).digest('hex')`.
24. **Zero-Downtime Rotation:** Initiating rotation creates replacement credential while maintaining old credential during grace window.
25. **Immediate Revocation:** Calling `/revoke` sets `is_revoked = true`; Ingestion Gateway rejects token immediately.
26. **Cross-Project Credential Denial:** Credential generated for `billing` is rejected when attempting to ingest logs into `auth-service`.
27. **Audit Secret Redaction:** Credential creation audit record contains `key_prefix`, strictly omitting raw token.
28. **Environment Scope Enforcement:** Credential restricted to `production` is rejected when submitting `staging` events.
29. **Concurrent Rotation Protection:** Concurrent rotation requests on the same credential resolve deterministically via DB lock.
30. **Gateway Interoperability:** Generated tokens successfully authenticate against real `IngestionGateway` test harness.

### 2.4 API & Transactional Integrity Scenarios (31–40)
31. **Project Creation Lifecycle:** Provisions project, initializes default quotas, and records audit event in a single transaction.
32. **Project Metadata Update:** Validates kebab-case ID and updates display title.
33. **Cross-Tenant Project Query Denial:** Requesting `/admin/v1/tenants/A/projects/B` when token is for Tenant C returns `403`.
34. **Optimistic Concurrency Conflict:** Submitting outdated `If-Match` ETag on quota update fails with `409 Precondition Failed`.
35. **Transactional Audit Rollback:** If audit event persistence fails, the entire project/credential mutation is rolled back.
36. **Malformed Payload Rejection:** Payloads violating JSON Schema Draft 2020-12 fail with `400 Bad Request` and detailed error paths.
37. **Rate Limiting Protection:** Rapid sequential admin calls trigger `429 Too Many Requests` with `Retry-After`.
38. **RFC 7807 Conformance:** All error responses conform to the standard Problem Details structure.
39. **OpenAPI Schema Conformance:** All 200/201 responses validate cleanly against versioned response schemas.
40. **Cascade Cleanup Integrity:** Decommissioning a project or tenant cleanly updates associated memberships without orphan records.
