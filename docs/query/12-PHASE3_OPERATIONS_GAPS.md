# Phase 3 Operational Readiness & Production Deployment Gaps

**Document Version:** 1.0.0  
**Status:** Approved Operational Assessment  
**Task Reference:** LOGHUB-QUERY-008  
**Phase:** Phase 3 — Query, Search & Analytics  
**Date:** 2026-10-27  

---

## 1. Purpose & Scope

This document provides a realistic, transparent audit of the operational capabilities, deployment prerequisites, and architectural boundaries of Skyra LogHub Phase 3 (`apps/query-service`).

**Phase 3 Functional Acceptance does not equate to unrestricted production deployment certification.** This assessment explicitly distinguishes:
1. Controls implemented and verified in application code.
2. Controls documented but requiring platform infrastructure deployment.
3. Operational gaps deferred to Phase 4 or subsequent platform milestones.

---

## 2. Operational Control Classification Matrix

| Dimension | Control Description | Current Implementation Status | Deployment Requirement / Infrastructure Action | Operational Risk If Unconfigured |
| :--- | :--- | :---: | :--- | :--- |
| **Authentication Provider** | Real enterprise identity provider integration (OIDC/JWKS) | Documented / Configured | Configure `QUERY_AUTH_MODE=jwt`, set `JWT_JWKS_URI` or `JWT_PUBLIC_KEY` pointing to corporate IdP | In test mode (`QUERY_AUTH_MODE=test`), mock tokens are accepted; must be disabled in production |
| **Filesystem Security** | Read-Only mount for Canonical Archives | Implemented in code | Operating system mount configuration: `/var/loghub/archive` mounted with `ro` flag | If mounted `rw`, compromised host processes could theoretically mutate archive files |
| **Cache Root Isolation** | Derived Parquet cache permissions | Implemented in code | Dedicated directory `/var/loghub/derived-parquet` with write access restricted to worker UID | Unauthorized write access could allow cache poisoning |
| **Service Account Privilege** | Least-privilege unprivileged user | Documented | Container / systemd service running under UID `skyra-query` (no root access) | Running as root elevates risk of filesystem or container breakout |
| **Process Cgroup Caps** | Hard memory and CPU limits | Documented | Docker / Kubernetes resource limits: `memory: 4Gi`, `cpu: 4.0` | DuckDB `SET max_memory` limits internal memory, but not OS-level process overhead |
| **Scratch Disk Governance** | Temporary spill directory isolation | Implemented in code | Dedicated scratch volume mounted at `/tmp/skyra-query-spill` with periodic cleanup | Unbounded spill on heavy sorts could exhaust root filesystem |
| **Multi-Writer Coordination** | Derived Parquet cache generation | Single-Worker Implemented | Deploy single materialization worker per cluster, or integrate distributed lock (Redis/etcd) | Running multiple concurrent Parquet writers without coordination risks redundant work |
| **Horizontal Query Scaling** | Query Service replica scaling | Implemented in code | Deploy `apps/query-service` as stateless replicas behind reverse proxy / load balancer | Replicas share read-only archive mounts and PostgreSQL metadata without cross-instance state |
| **Cursor Secret Rotation** | Pagination HMAC secret lifecycle | Implemented in code | Store `CURSOR_SIGNING_SECRET` in secret manager (Vault/AWS Secrets Manager) with key versioning | Reusing default or static secrets compromises cursor tamper-proofing |
| **Database Migration Safety** | PostgreSQL schema modifications | Implemented in code | Zero migrations executed in Phase 3; `archive_segments` table reused from Phase 2 | Unauthorized schema changes break zero-downtime rolling upgrades |
| **Audit Log Persistence** | Centralized query audit database table | Proposed Baseline | Operational structured logging active; PostgreSQL `query_audit_logs` table deferred | High-volume query audit events emitted to stdout; requires aggregation by log shipper |

---

## 3. Detailed Operational Findings & Mitigations

### 3.1 Authentication & Principal Grants
- **Current State:** The Query Service implements `QueryAuthGuard` supporting standard RFC 7519 JWT verification (`HS256`, `RS256`, `EdDSA`) with claim extraction (`sub`, `tenantId`, `authorizedProjects`, `roles`). In development and automated tests, `QUERY_AUTH_MODE=test` accepts base64url test tokens for deterministic, offline testing.
- **Production Prerequisite:** Production deployments must strictly enforce `QUERY_AUTH_MODE=jwt` and provide a validated corporate JWKS endpoint (`JWT_JWKS_URI`). Test authentication must be rejected at startup in production environments.

### 3.2 Time-of-Check to Time-of-Use (TOCTOU) Mitigations
- **Threat:** Between Query Service pre-read descriptor verification (SHA-256 and byte size validation) and DuckDB's C++ native file opening (`read_ndjson_objects` / `read_parquet`), an adversarial process could attempt file substitution.
- **Compensating Controls:**
  1. The canonical archive directory must be mounted **Read-Only (`ro`)** at the operating system or container volume level.
  2. DuckDB extension loading is disabled (`autoinstall_known_extensions: false`, `autoload_known_extensions: false`), preventing native arbitrary code execution.
  3. Realpath containment verifies that symbolic links cannot escape `ARCHIVE_ROOT` or `PARQUET_CACHE_ROOT`.

### 3.3 Horizontal Scaling & Cache Synchronization
- **Stateless Query Nodes:** The Query Service maintains zero persistent local state. Any number of stateless `skyra-query-service` container replicas can serve search and analytical traffic concurrently against shared storage (NFSv4, Amazon EFS, CephFS).
- **Single-Writer Materialization:** The derived Parquet materializer is designed for single-process conversion per partition. When scaling query workers horizontally, materialization should be assigned to a designated worker queue to avoid redundant conversions.

### 3.4 Operational Health & Readiness Probes
- **`GET /health/live` (Liveness Probe):** Evaluates Node.js event loop responsiveness. Does not evaluate external dependencies, preventing cascading restart storms during transient network blips.
- **`GET /health/ready` (Readiness Probe):** Evaluates essential operational dependencies:
  - Valid configuration loaded.
  - PostgreSQL metadata repository reachable.
  - Canonical archive storage root directory accessible.
  - DuckDB in-memory analytical instance initialized.
  - Resource governor initialized.
- **Cache Fault Resilience:** A missing, corrupt, or uninitialized Parquet cache **does not** mark the service unready. The Query Service seamlessly falls back to querying canonical JSONL archives.

---

## 4. Phase 4 Platform Recommendations

1. **Persistent Query Audit Storage:** Implement an asynchronous batch sink or dedicated table (`query_audit_logs`) for long-term compliance archiving of query executions.
2. **Distributed Materialization Locks:** Introduce Redis or PostgreSQL advisory locks if multiple background conversion workers are deployed concurrently.
3. **Automated Cache Warming:** Pre-materialize Parquet segments immediately upon Phase 2 segment finalization rather than lazily on first query.
