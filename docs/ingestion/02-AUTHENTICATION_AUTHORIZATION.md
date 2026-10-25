# Skyra LogHub — Ingestion Authentication & Authorization Architecture

**Document ID:** `LOGHUB-DOC-ING-002`  
**Task Reference:** `LOGHUB-ING-001A`  
**Phase:** Phase 2 (Centralized Ingestion)  
**Status:** Architecture Specification & Baseline  
**Architecture Reference:** ADR-007, ADR-012, ADR-016

---

## 1. Overview & Trust Perimeter

The Ingestion Gateway enforces strict zero-trust boundary validation. All ingestion traffic originates either from:
1. **Server Shippers / Backend Microservices:** Direct authorized server-to-server HTTP POST requests using scoped machine credentials.
2. **Browser / Frontend Applications:** Mediated strictly through an authorized same-origin backend proxy.

Browser clients are untrusted environments. Direct ingestion access from browser clients to the central gateway using shared static secrets is strictly prohibited.

---

## 2. Machine Credential Architecture

### 2.1 Credential Structure & Transport
- **Header:** Standard RFC 6750 `Authorization: Bearer <token>`.
- **Token Format:** Cryptographically random, high-entropy 256-bit opaque strings prefixed with an environment indicator:
  - `skyra_ingest_live_<32_hex_chars>` (Production)
  - `skyra_ingest_test_<32_hex_chars>` (Staging / Development)
- **Deprecation of Custom Headers:** The previously proposed `X-Skyra-Proxy-Secret` custom header is superseded by standard RFC Bearer authentication. Standardizing on `Authorization: Bearer` ensures seamless integration with corporate API gateways, service meshes, and secret managers.

### 2.2 Server-Side Storage & Hashing
- Ingestion credentials are never stored in plaintext within PostgreSQL.
- The `ingestion_credentials` table stores a salted SHA-256 hash or Argon2id digest of the token.
- At runtime, the gateway caches verified token hashes in local memory with a short TTL (e.g. 60 seconds) or checks them against PostgreSQL.

### 2.3 Credential Scoping & Tenant Binding
Every credential is strictly bound to:
1. `tenant_id`: Canonical organization or enterprise customer ID.
2. `allowed_projects`: Array of allowlisted project IDs (e.g. `["skyra-tech", "skyra-portal"]`).
3. `allowed_environments`: Array of allowlisted tiers (e.g. `["production", "staging"]`).
4. `expires_at`: Mandatory expiration timestamp (maximum 365 days; 90 days recommended).
5. `is_revoked`: Immediate revocation boolean flag.

```sql
-- Operational Ingestion Credential Schema
CREATE TABLE ingestion_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    key_hash VARCHAR(64) NOT NULL UNIQUE,
    key_prefix VARCHAR(24) NOT NULL,
    description VARCHAR(255) NOT NULL,
    allowed_projects TEXT[] NOT NULL,
    allowed_environments TEXT[] NOT NULL,
    rate_limit_per_minute INT NOT NULL DEFAULT 600,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
    last_used_at TIMESTAMPTZ
);
```

---

## 3. Anti-Spoofing & Context Enforcement

A common distributed logging vulnerability is "project spoofing," where an authorized service in Project A submits logs claiming to belong to Project B.

### Invariant: Server-Authoritative Identity Derivation
1. When a batch is received, the gateway resolves the authenticated `tenant_id` and `allowed_projects` from the Bearer token.
2. The gateway inspects every event in the batch:
   - If an event declares `skyra.project_id` that is not in the credential's `allowed_projects`, the **entire batch is rejected** with `403 Forbidden` (`PROJECT_ACCESS_DENIED`).
   - If an event declares `service.environment` that is not in `allowed_environments`, the batch is rejected with `403 Forbidden` (`ENVIRONMENT_MISMATCH`).
3. The gateway attaches the verified `tenant_id` to the journal commit record and segment partition. Clients cannot supply or forge `tenant_id` in request payloads.

---

## 4. Browser Ingestion Trust Boundary

### 4.1 Topology & Proxy Pattern
```
+-------------------------------------------------------------------------+
| UNTRUSTED BROWSER RUNTIME                                               |
| (@skyra/logger-browser / Angular / React)                               |
+-------------------------------------------------------------------------+
       |
       | 1. POST /api/telemetry (Same-Origin HTTPS)
       |    - Cookie / Bearer Session Authentication
       |    - Same-Origin / CORS Enforcement
       |    - CSRF Protection (Double-Submit Cookie or Header)
       |    - Body Limit (512 KiB) & Rate Limiting
       v
+-------------------------------------------------------------------------+
| TRUSTED APPLICATION BACKEND PROXY (Next.js, NestJS, Express, FastAPI)   |
+-------------------------------------------------------------------------+
       | 2. Validates User Session & Project Authorization
       | 3. Normalizes & Sanitizes Browser Payloads
       | 4. Injects Server-Held Ingestion Secret (Bearer Token)
       | 5. Adds Proxy Tracing Headers:
       |    - X-Skyra-Forwarded-Client-IP
       |    - X-Skyra-Client-Session-Id
       |
       | 6. POST /ingest/v1/logs (Internal Network / Mutual TLS / HTTPS)
       v
+-------------------------------------------------------------------------+
| SKYRA LOGHUB INGESTION GATEWAY                                          |
+-------------------------------------------------------------------------+
```

### 4.2 Security Rules for Application Proxies
1. **Zero Secret Exposure:** Browser bundles MUST NOT contain the gateway Bearer token.
2. **Session Binding:** Telemetry from authenticated web sessions must validate that the user has an active session before the backend forwards the log to LogHub.
3. **CSRF Mitigation:** If the backend proxy uses cookie authentication, CSRF tokens (or SameSite=Strict cookies with anti-forgery headers) must be verified prior to forwarding.
4. **Proxy Telemetry Headers:**
   - `X-Skyra-Forwarded-Client-IP`: Contains the real client IP extracted from the edge load balancer.
   - `X-Skyra-Client-Session-Id`: Anonymized session identifier for correlating browser sessions without exposing raw session secrets or PII.

### 4.3 Future Grant Tokens (Out of Scope for MVP)
Short-lived, cryptographically signed JWT grants (e.g. 5-minute ephemeral tokens issued by the application backend) were evaluated. While viable for high-volume decoupled browser ingestion, they introduce distributed key management, clock skew risks, and token revocation complexity. They are documented as an optional post-MVP enhancement. The same-origin backend proxy pattern is the mandatory MVP baseline.

---

## 5. Credential Lifecycle & Emergency Revocation

1. **Rotation Procedure:**
   - Shippers and backend applications support dual-credential overlap (Grace Period).
   - A new credential is generated and deployed to shippers.
   - The old credential remains active for 24 hours to accommodate rolling deployment restarts.
   - The old credential is deleted or marked `is_revoked = true` in PostgreSQL.
2. **Immediate Revocation:**
   - Marking `is_revoked = true` in PostgreSQL immediately invalidates the cached credential on all gateway nodes within the cache TTL window (max 60 seconds).
   - Gateway nodes subscribe to PostgreSQL `LISTEN/NOTIFY` on `credential_revocation` channel for sub-second cache purge across clustered nodes.
3. **Audit Logging:**
   - All authentication failures (`401 UNAUTHORIZED`, `403 PROJECT_ACCESS_DENIED`) generate high-priority security audit events in the LogHub system log.
   - Audit logs capture the originating IP, credential prefix, attempted project ID, and timestamp without logging the secret token itself.
