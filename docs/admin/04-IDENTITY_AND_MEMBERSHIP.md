# Skyra LogHub — Authoritative Identity & Membership Architecture

**Document Version:** 1.0.0  
**Status:** Approved Architecture Specification  
**Task ID:** `LOGHUB-ADMIN-001`  
**Phase:** Phase 4 — Administration Backend Foundation  
**Date:** 2026-10-28  

---

## 1. Identity Foundation & OIDC Claims Federation

Skyra LogHub federates authentication with enterprise OpenID Connect (OIDC) identity providers (e.g. Microsoft Entra ID, Okta, PingFederate, Google Workspace).

### 1.1 The Composite Identity Invariant: `(issuer, subject)`
A common vulnerability in enterprise SaaS platforms is anchoring user accounts solely on email address or unnamespaced subject identifiers (`sub`):
- **Email Mutability:** Corporate emails change during name changes, corporate acquisitions, or domain migrations.
- **Cross-Issuer Collision:** Two distinct identity providers (e.g. Acme Corp's Entra ID and Beta Inc's Okta) may both issue an identical numeric subject identifier (e.g. `sub: "10001"`).

**Skyra LogHub Mandate:**  
Every user identity in PostgreSQL is strictly anchored to the cryptographic tuple:
```sql
UNIQUE (issuer, subject)
```
- `issuer`: Canonical HTTPS URL of the IdP (e.g. `https://sts.windows.net/72f988bf-.../`).
- `subject`: Immutable subject identifier assigned by that specific IdP.
- `id`: Internal UUIDv4 primary key used as foreign key throughout LogHub tables.

Passwords, password hashes, and MFA secrets are **never stored** in the Skyra LogHub database.

---

## 2. User Provisioning Lifecycle

```text
       Corporate OIDC Login
                 │
                 ▼
       Token Exchange (PKCE)
                 │
                 ▼
     ┌───────────────────────┐
     │  Lookup User Record   │ (issuer, subject)
     └───────────┬───────────┘
                 │
        ┌────────┴────────┐
        ▼                 ▼
   User Exists       User Does Not Exist
        │                 │
        │            ┌────┴────────────────────────┐
        │            │ Check Pending Invitations   │
        │            │ by verified email address   │
        │            └────┬────────────────────────┘
        │                 │
        │          ┌──────┴──────┐
        │          ▼             ▼
        │     Found Invite   No Invite Found
        │          │             │
        │     Create User &      ▼
        │     Accept Invite  Fail Closed (403)
        │          │         "Access Denied: No
        │          │          Active Invitation"
        ▼          ▼
    Establish Session & Workspace
```

### 2.1 First-Login Behavior
1. **No Open Registration:** A user authenticating through corporate SSO is **not** automatically granted tenant ownership or workspace access. Access without an active invitation or pre-provisioned membership fails closed (`403 Forbidden`).
2. **Invitation Matching:** If an invitation exists matching the verified email address from the OIDC `id_token` claims (`email_verified: true`), a new `User` record is created and bound to the `(issuer, subject)` tuple, and the corresponding `TenantMembership` is activated in a single PostgreSQL transaction.
3. **Display Name & Email Sync:** On every authenticated session establishment, the user's current `email` and `displayName` are updated from the latest IdP assertions.

---

## 3. Membership State Machine

Tenants and Projects manage memberships via explicit state transitions:

```text
               ┌──────────────────┐
               │  PENDING_INVITE  │
               └────────┬─────────┘
                        │ User completes first SSO login
                        ▼
               ┌──────────────────┐
        ┌─────>│      ACTIVE      │<─────┐
        │      └────────┬─────────┘      │
        │               │                │
Admin   │         Admin │          Admin │
Reactivates   Suspends  ▼     Reactivates│
        │      ┌──────────────────┐      │
        └──────│    SUSPENDED     │──────┘
               └────────┬─────────┘
                        │ Admin removes user
                        ▼
               ┌──────────────────┐
               │     REVOKED      │ (Terminal State)
               └──────────────────┘
```

- **`ACTIVE`:** User can select the tenant workspace and access authorized projects according to assigned roles.
- **`SUSPENDED`:** Temporary administrative lock (e.g., during internal audits or leave of absence). All active sessions are terminated immediately; in-flight queries are rejected.
- **`REVOKED`:** Permanent removal. Historical audit entries maintain the user's surrogate ID for forensic compliance, but workspace access is permanently barred.

---

## 4. Authoritative `IMembershipProvider` Architecture

To eliminate the development fixtures currently in `apps/console-bff`, the future `MembershipService` will query the authoritative PostgreSQL metadata database:

```typescript
export interface IMembershipProvider {
  /**
   * Resolves the authoritative workspace and project memberships for an authenticated user.
   * Backed by PostgreSQL indexed relational queries with short-lived memory caching.
   */
  resolveMemberships(userId: string, email: string): Promise<WorkspaceMembership[]>;
  
  /**
   * Invalidates any cached membership assertions upon administrative role mutation.
   */
  invalidateMembershipCache(userId: string): Promise<void>;
}
```

### Relational Resolution Query
The membership provider executes an indexed join across `tenants`, `tenant_memberships`, `project_memberships`, `projects`, and `role_assignments`:
```sql
SELECT 
    t.id AS tenant_id,
    t.name AS tenant_name,
    p.id AS project_id,
    p.name AS project_name,
    r.name AS role_name
FROM tenant_memberships tm
JOIN tenants t ON t.id = tm.tenant_id
LEFT JOIN project_memberships pm ON pm.user_id = tm.user_id AND pm.status = 'ACTIVE'
LEFT JOIN projects p ON p.id = pm.project_id AND p.tenant_id = t.id AND p.status = 'ACTIVE'
LEFT JOIN role_assignments ra ON ra.user_id = tm.user_id AND ra.tenant_id = t.id
LEFT JOIN roles r ON r.id = ra.role_id
WHERE tm.user_id = $1 
  AND tm.status = 'ACTIVE' 
  AND t.status = 'ACTIVE';
```

---

## 5. Cross-Service Consistency & Revocation Guarantees

A central requirement of the mission is ensuring that revoking a user's access propagates across all services without leaving open windows of vulnerability.

### 5.1 Architectural Invariants
1. **Internal Scoped Assertion Lifetime:** All internal JWTs minted by the BFF for downstream consumption (`apps/query-service`, `apps/admin-service`) have an aggressive Time-to-Live (TTL) of **60 seconds**.
2. **BFF Session Invalidation:** When an administrator revokes a user's membership or suspends a project via `apps/admin-service`:
   - An event `MEMBERSHIP_REVOKED` is dispatched.
   - The BFF's session store immediately purges or marks the affected user's session cache as dirty.
   - Any active WebSocket or Long-Polling channel is terminated.
3. **Maximum Propagation Window:**
   - *BFF Endpoints:* **0 seconds (Immediate).** Subsequent requests from the browser trigger a fresh membership resolution and fail closed.
   - *Query Service Active Queries:* **$\le 60$ seconds.** Existing 60s internal tokens expire naturally. Because the Query Service independently validates token expiration (`exp`) on every request, no caller can execute queries beyond the 60s TTL.
4. **Fail-Closed Availability:** If the metadata database or membership service is unavailable, all membership resolutions fail closed (`503 Service Unavailable`), preventing unauthorized access during platform partitions.
