# Skyra LogHub — Stage 2 Authoritative Membership & Authorization Activation Runbook (ADMIN-002)

**Document ID:** `LOGHUB-ADMIN-002-STAGE-2-AUTHORIZATION-ACTIVATION-RUNBOOK`  
**Milestone:** `LOGHUB-ADMIN-002-GATE-B` (Stage 2 — Authoritative Activation & Live Integration)  
**Execution Condition:** STRICTLY PENDING POST-STAGE-1 REVIEW AND EXPLICIT HUMAN AUTHORIZATION  
**Prerequisites:** Successful Stage 1 migration verification on `skyra_loghub_dev` with zero regression.

---

> [!CAUTION]
> **DO NOT EXECUTE THIS RUNBOOK WITHOUT EXPLICIT STAGE 2 WRITTEN SIGN-OFF.**  
> Stage 1 approval (schema migration) DOES NOT imply Stage 2 approval (authorization activation).  
> In Stage 0 and Stage 1, all authoritative membership lookups and bootstrap hooks MUST remain disabled.

---

## 1. Architectural Scope & Target End-State

Stage 2 activates the production-grade identity, membership, and authorization pipeline:

```text
Angular Console
      │
      │ Secure HTTP-only Cookie / Session Bearer
      ▼
Console BFF (apps/console-bff)
      │
      │ Trusted Service Authentication (mTLS / Service Token)
      │ Verified (issuer, subject) Principal Identity
      ▼
Administration Service (apps/admin-service)
      │
      │ PostgreSQL Persistence Adapter (Prisma)
      │ Tenant & Project Memberships
      │ RBAC / Effective Capability Evaluation
      │ Revocation Ledger Checks
      ▼
PostgreSQL Database (`skyra_loghub_dev`)

Console BFF
      │
      │ Short-Lived Scoped JWT (≤ 60s lifetime, RS256 / EdDSA)
      ▼
Query Service (apps/query-service)
      │
      │ Independent JWT Signature & Claims Verification
      │ Strict Project Authorization & Tenant Boundary Enforcement
      ▼
Authorized Log Data
```

### Critical Security Invariants
1. **No Universal Admin:** No universal superuser or global bypass exists.
2. **No Arbitrary Header Trust:** Admin Service never trusts unverified browser-supplied user identity headers.
3. **No BFF-Manufactured Claims:** Console BFF cannot mint arbitrary tenant/project memberships; all memberships are resolved authoritatively from Admin Service.
4. **Strict `(issuer, subject)` Binding:** All identity bindings require exact OIDC `issuer` and `subject` matching. Email addresses are informational only.

---

## 2. Controlled Initial Tenant Owner Bootstrap Plan

To establish the initial authoritative state without backdoor accounts:

### 2.1 Bootstrap Constraints
- **One-Time Only:** Once a tenant has an `ACTIVE` owner (`OrgOwner`), all subsequent bootstrap invocations for that tenant are strictly rejected.
- **Concurrent Lock:** Bootstrap operations acquire an advisory transaction lock (`pg_advisory_xact_lock`) on the tenant ID to prevent race conditions.
- **Explicit Principal:** Requires explicit `issuer`, `subject`, and target `tenant_id`. No wildcard identity is permitted.
- **Audited Execution:** An immutable `admin_audit_events` record is written atomically with the owner assignment.

### 2.2 Bootstrap Protocol
```bash
# Execute FirstOwnerBootstrapService via dedicated CLI / script with one-time bootstrap token
pnpm --filter @skyra/admin-service exec ts-node scripts/bootstrap-tenant-owner.ts \
  --tenant-id="00000000-0000-0000-0000-000000000001" \
  --issuer="https://auth.skyra.tech" \
  --subject="usr_sec_admin_01" \
  --email="admin@skyra.tech" \
  --role="OrgOwner" \
  --audit-actor="ops-bootstrap-operator"
```

### 2.3 Bootstrap Verification
Verify that exactly one owner exists in the database:
```sql
SELECT u.id, u.email, tm.tenant_id, tm.status, r.name AS role_name
FROM users u
JOIN tenant_memberships tm ON tm.user_id = u.id
JOIN role_assignments ra ON ra.membership_id = tm.id
JOIN roles r ON r.id = ra.role_id
WHERE tm.tenant_id = '00000000-0000-0000-0000-000000000001';
```

---

## 3. Configuration & Feature Flag Activation Sequence

Execute configuration changes in strict topological order:

### 3.1 Step A: Admin Service Persistence Activation
In `apps/admin-service/.env`:
```ini
ADMIN_DB_PERSISTENCE_ENABLED=true
DATABASE_URL="postgresql://skyra_loghub_user:<SECRET>@127.0.0.1:5432/skyra_loghub_dev?schema=public"
```
Restart `apps/admin-service` and verify readiness endpoint returns `200 OK` with database health `UP`.

### 3.2 Step B: BFF Authoritative Membership Adapter Activation
In `apps/console-bff/.env`:
```ini
ADMIN_SERVICE_ENABLED=true
ADMIN_SERVICE_URL="http://127.0.0.1:3002"
ADMIN_SERVICE_TOKEN="<SECURE_INTERNAL_SHARED_SECRET>"
USE_AUTHORITATIVE_MEMBERSHIP=true
```
Restart `apps/console-bff`.

### 3.3 Step C: Query Service JWT Authorization Configuration
In `apps/query-service/.env`:
```ini
QUERY_AUTH_REQUIRED=true
JWT_ISSUER="skyra-console-bff"
JWT_AUDIENCE="skyra-query-service"
JWT_PUBLIC_KEY_PATH="/etc/skyra/keys/bff-jwt-public.pem"
```
Restart `apps/query-service`.

---

## 4. End-to-End Cross-Service Security Test Suite

The following 20 security test cases must be executed and pass before production release:

| Test ID | Test Scenario | Expected Result | Enforcing Component |
| :--- | :--- | :--- | :--- |
| **SEC-01** | Valid OIDC identity with active project membership | 200 OK with scoped query results | BFF, Admin Service, Query Service |
| **SEC-02** | Authenticated user requests access to unauthorized tenant | 403 Forbidden (`TENANT_ACCESS_DENIED`) | Admin Service & BFF |
| **SEC-03** | Authenticated user requests access to unauthorized project | 403 Forbidden (`PROJECT_ACCESS_DENIED`) | Admin Service & BFF |
| **SEC-04** | Expired user session cookie presented to BFF | 401 Unauthorized (`SESSION_EXPIRED`) | Console BFF Session Manager |
| **SEC-05** | Token with unexpected OIDC `issuer` presented | 401 Unauthorized (`INVALID_OIDC_ISSUER`) | Console BFF Auth Handler |
| **SEC-06** | Query Service receives JWT with mismatched `audience` | 401 Unauthorized (`INVALID_AUDIENCE`) | Query Service JWT Guard |
| **SEC-07** | Query Service receives JWT with forged/tampered signature | 401 Unauthorized (`INVALID_SIGNATURE`) | Query Service JWT Guard |
| **SEC-08** | User membership revoked in PostgreSQL; user requests query | 403 Forbidden within cache TTL (max 60s) | Admin Service Revocation Check |
| **SEC-09** | User identity disabled (`UserStatus = 'DEACTIVATED'`) | 403 Forbidden immediately on next lookup | Admin Service Membership Resolver |
| **SEC-10** | Tenant status set to `SUSPENDED` | 403 Forbidden on all tenant requests | Admin Service & BFF Gateway |
| **SEC-11** | Project marked disabled / soft-deleted | 404 / 403 Project Unavailable | Admin Service & Query Service |
| **SEC-12** | Administration PostgreSQL database outage | 503 Service Unavailable (Fail closed, zero fallback) | Admin Service Readiness & BFF |
| **SEC-13** | Permission cache expiry (TTL: 60s) | Cache refreshed from database automatically | Admin Service Policy Engine |
| **SEC-14** | Client injects forged `role` header in HTTP request | Header ignored; roles resolved exclusively via DB | Console BFF & Admin Service |
| **SEC-15** | Client injects forged `project_id` in scoped query token | Signature verification fails; 401 Unauthorized | Query Service JWT Guard |
| **SEC-16** | Cross-tenant project access (Project ID belongs to Tenant B) | 403 Forbidden (Strict tenant isolation) | Admin Service & Query Service |
| **SEC-17** | Admin Service completely unavailable / down | BFF fails closed, returning 503 Network Unavailable | Console BFF Authoritative Adapter |
| **SEC-18** | Query Service query token expired (> 60s old) | 401 Unauthorized (`TOKEN_EXPIRED`) | Query Service JWT Guard |
| **SEC-19** | User explicitly logs out from Console | Session destroyed; subsequent calls return 401 | Console BFF Session Manager |
| **SEC-20** | Last tenant owner downgrade attempted concurrently | Database transaction rejects demotion (Error 409) | Admin Service Concurrency Guard |

---

## 5. Revocation Acceptance & Latency Budget

To satisfy enterprise IAM requirements, the revocation latency budget is strictly bounded:

```text
Actor Revocation in Admin Service (T0)
   ├── Invalidate local Admin Service memory cache: ≤ 50 ms
   ├── Invalidate BFF permission cache (Redis / Webhook): ≤ 500 ms
   └── Outstanding Query Service JWT expiry: ≤ 60 seconds
Total Revocation Latency Upper Bound: ≤ 60.55 seconds
```

### Verification Procedure:
1. Issue active query session for user.
2. Execute revocation: `UPDATE tenant_memberships SET status = 'REVOKED' WHERE user_id = ...`.
3. Dispatch queries every 5 seconds.
4. Verify that within 60 seconds, all queries return `403 Forbidden`.
5. Verify zero stale queries accepted after $T_0 + 60\text{s}$.

---

## 6. Readiness, Liveness & Fail-Closed Policies

### 6.1 Admin Service
- **Liveness (`/healthz`):** Returns `200 OK` if process event loop is responsive.
- **Readiness (`/readyz`):**
  - Executes `SELECT 1` on `skyra_loghub_dev`.
  - Verifies presence of `tenant_memberships` table.
  - Returns `503 Service Unavailable` if database disconnected.

### 6.2 Console BFF
- **Dependency Readiness:**
  - Probes Admin Service `/readyz`.
  - When `USE_AUTHORITATIVE_MEMBERSHIP=true`, BFF marks itself unready if Admin Service fails.
  - **FAIL-CLOSED GUARANTEE:** In production, BFF NEVER falls back to mock or demo identities. If authority is unreachable, BFF surfaces RFC 7807 problem details (`503 Identity Authority Unavailable`).

### 6.3 Query Service
- **Authorization Readiness:**
  - Public verification key loaded and valid.
  - Returns `503` if JWT verification keys are unreadable or corrupt.
