# Skyra LogHub — Administration Security Threat Model (STRIDE)

**Document Version:** 1.0.0  
**Status:** Approved Architecture Specification  
**Task ID:** `LOGHUB-ADMIN-001`  
**Phase:** Phase 4 — Administration Backend Foundation  
**Date:** 2026-10-28  

---

## 1. Threat Modeling Methodology

This assessment applies the **STRIDE** methodology (Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege) across all administrative boundaries between the Angular Web Console, Console BFF, Administration Service, and PostgreSQL metadata.

---

## 2. STRIDE Assessment Matrix

| Threat Category | Threat Description | Severity | Trust Boundary | Preventative Countermeasure | Detection & Audit Control | Residual Risk |
|---|---|:---:|---|---|---|:---:|
| **Spoofing** | Caller presents forged internal JWT to `apps/admin-service`. | **Critical** | BFF $\rightarrow$ Admin Service | Admin Service independently validates HMAC-SHA256/RS256 signature, `iss`, and `aud` with short 60s TTL. | Alerts on invalid signature verification failures. | Low |
| **Spoofing** | Cross-issuer OIDC subject collision (`sub: "123"` from different IdPs). | **Critical** | IdP $\rightarrow$ User Identity | Composite unique constraint `@@unique([issuer, subject])` in PostgreSQL. | System logs issuer URI on session creation. | Negligible |
| **Tampering** | Caller modifies `:tenantId` in URL to manipulate foreign tenant resources (IDOR). | **Critical** | Admin API Route $\rightarrow$ Domain Layer | Tenancy Interceptor enforces that URL `tenantId` strictly matches token `tid` claim. | Emits `CROSS_TENANT_VIOLATION_ATTEMPT` audit alert. | Negligible |
| **Tampering** | Concurrent updates to project quotas cause race conditions and overwritten values. | **Medium** | Client $\rightarrow$ Database | Optimistic concurrency control via `If-Match` ETag headers and PostgreSQL transactions. | DB serialization failures logged and returned as 409 Conflict. | Low |
| **Repudiation** | Administrator mutates critical project setting or rotates key without trail. | **High** | Admin Service $\rightarrow$ Audit Store | Transactional audit recording; if audit write fails, administrative mutation is rolled back. | Append-only `admin_audit_events` table. | Negligible |
| **Info Disclosure**| Ingestion credential secret leaked in API response, list view, or server logs. | **Critical** | Admin API $\rightarrow$ Client / Logger | Plaintext secret revealed exactly once; only SHA-256 verifier stored; logs automatically scrub secrets. | Periodic log file scanning for unredacted token patterns. | Low |
| **Info Disclosure**| User enumerates other tenants by guessing sequential IDs. | **Medium** | Client $\rightarrow$ Admin API | All tenant and user IDs are non-sequential random UUIDv4 identifiers. | 404 returned for non-existent or unauthorized IDs. | Negligible |
| **Denial of Service** | Malicious admin floods credential creation or project provisioning. | **Medium** | Client $\rightarrow$ PostgreSQL | Per-tenant rate limits on admin endpoints; project quota count caps. | 429 Too Many Requests response with Retry-After header. | Low |
| **Privilege Escalation** | `ProjectAdmin` attempts to promote themselves or peers to `OrgAdmin`. | **Critical** | Client $\rightarrow$ RBAC Policy | Server-side RBAC guard verifies caller has `tenant.members.manage` and role $\ge$ assigned role. | Emits `PRIVILEGE_ESCALATION_BLOCKED` security event. | Negligible |
| **Privilege Escalation** | Admin deletes sole `OrgOwner`, leaving tenant orphaned and unmanageable. | **High** | Client $\rightarrow$ Domain Entity | Domain policy enforces minimum of 1 active `OrgOwner`; rejection with 409 Conflict. | Logged as `LAST_OWNER_REMOVAL_REJECTED`. | Negligible |

---

## 3. Residual Risk Assessment & Hardening Recommendations

1. **Compromised Corporate OIDC IdP:** If an enterprise customer's central IdP is breached, attackers could authenticate as legitimate users.  
   *Mitigation:* Skyra LogHub supports IdP session termination checks, MFA enforcement via OIDC `amr` claims, and emergency tenant suspension.
2. **PostgreSQL Database Administrator Access:** A direct database administrator with superuser access could bypass application-layer RBAC.  
   *Mitigation:* Database encryption at rest (AWS RDS KMS / dm-crypt), restricted network access via VPC security groups, and read-only access for operational replicas.
