# Deployment, Infrastructure and Operations

> **Product:** Skyra LogHub  |  **Status:** Proposed baseline — review before implementation  |  **Version:** 0.1-draft  |  **Date:** 2026-10-21
> **Repository:** `skyra-loghub` (renamed by project owner). Assumptions and undecided items are marked **TBD**. These documents are design specifications, not assertions that code already exists.

## 1. Supported environments
- Local development: Docker Compose with synthetic data, no public exposure.
- Single VM pilot: Docker Compose, persistent encrypted volumes, reverse proxy + TLS, off-host encrypted backups. Non-HA and must not host high-criticality data without approval.
- AWS/Azure/on-prem: containerized app/worker/collector, managed or self-hosted PostgreSQL, self-managed central JSONL archive + Parquet + DuckDB when selected; private networking/volume provisioning and IaC per provider.

## 2. Logical service inventory
`dashboard` Angular static web served by Nginx/Caddy; `api` NestJS; `ingest-gateway` NestJS/OTLP ingress; `mcp-server` private or OAuth-protected; `worker`; `collector`; `archive-and-query`; `postgres`; `valkey/redis`; `reverse-proxy`; optional identity provider externally managed.

## 3. Network boundaries
- Externally reachable only HTTPS reverse proxy endpoints needed for dashboard/login, approved machine ingress and authorized MCP.
- central file storage/PostgreSQL/Valkey/collector admin ports private, never bound publicly; firewall egress scoped, operator access via bastion/VPN where practical.
- CORS same-origin, secure cookies, separate service credentials, mTLS internal where feasible.

## 4. Configuration/secrets
Environment-driven immutable config with typed startup validation. Secret vault for DB, OIDC, ES, API token HMAC and collector service credentials. `.env.example` has dummy values only. Keep TLS certificates automatically renewed and keys rotated; deployment automation never prints secret values.

## 5. Storage/retention planning
Estimate: GB/day = events/sec × average event bytes × 86400 / 10^9, then add index overhead, replicas, headroom and snapshots. Select size/retention only after volume sampling. Separate application logs, security audits, derived analytical files, database volumes, collector checkpoints and temporary exports. Define hot retention and snapshots based on compliance, not blindly mirror local files.

## 6. Backups and recoverability
- PostgreSQL consistent backup + point-in-time strategy where feasible.
- archive object-storage snapshot/backup destination on off-host object storage; snapshot validation and restore drills; snapshots not substitutes for application security logs.
- RPO/RTO **TBD** with owner; encrypt backups, restrict IAM and test credential revocation after restore.
- Valkey queue recovery semantics and idempotent job handling; do not assume transient caches are durable source of truth.

## 7. Observability of LogHub itself
Monitor ingest success/rejection, collector lag/checkpoint age, event drops, archive disk usage, conversion lag and query worker saturation, API p95, query timeout, Postgres connections, token failures, rate-limit rejections, queue depth, MCP invocations, expired certificates, backup age and restore health.

## 8. Runbooks to write during implementation
Start/stop, user/credential recovery, file full/rotation failure, central storage/query service unavailable, duplicate events, failed migration, authentication provider outage, cross-project exposure incident, MCP disable switch, index restore, storage forecast/cost alert, rollout/rollback.

## 9. Security baseline
Use current supported image versions pinned by digest, non-root users and read-only containers where possible; scanner results tracked. Patch cadence, access audit, HTTPS, secret rotation, RBAC, data residency and restricted exports. Never put raw customer/application logs in CI artifacts.

## 10. Hosting choice comparison framework
| Criterion | Own server | AWS | Azure |
|---|---|---|---|
| Software licenses (free tiers) | Possible | Possible | Possible |
| Compute/storage/bandwidth | Hardware + operations | Metered services | Metered services |
| Identity integration | Configure OIDC | External/AWS-compatible | Strong Entra option |
| Backup/HA | Your responsibility | Provider building blocks | Provider building blocks |
| Portability | Docker images | Docker/VM | Docker/VM |
No fabricated monthly price. Estimate using daily log volume, retention, replicas, peak concurrency, region and availability target. Assess vendor licensing separately.

## 11. Rollout
Local synthetic → isolated staging with 2 demo services → private pilot with production-shaped traffic → security/load/restore gate → initial internal production → migrate other Skyra apps one-by-one with rollback. Each step needs documented signoff.


## Updated central file-storage deployment model
- Permanent centralized JSONL archive uses safe project/service/date prefixes on local durable volume, S3, Azure Blob or compatible object storage via adapter. Apps spool only temporarily; central ingestion finalizes immutable numbered segments (not concurrent writes into shared remote files).
- Parquet conversion/compaction runs in bounded workers; DuckDB query service reads approved partitions/manifests; cache in Valkey. PostgreSQL holds management/report definitions only, not diagnostic log rows.
- Development/pilot: local Docker Compose with mounted volumes and off-host backups. AWS: S3 + container/VM query worker + suitable persistent cache. Azure: Blob Storage + container/VM worker. Self-host: SSD/archive drive or compatible object store. Avoid storage-provider-specific APIs in SDKs.
- Monitor bytes/day, retained days, local spool overflow, ingestion ACK latency, segment finalization, Parquet compaction freshness, file count, query p95 and CPU/RAM, cache hit rate, archive integrity, restore speed. Scale decisions based primarily on source-app event volume and report workload, not 5–10 internal dashboard users.
- Never treat Parquet/cache as backup; backups cover JSONL archive, PostgreSQL metadata, security audit trail and configuration. Verify restore, replay and derived-data rebuild.

## 12. SDK Packaging, Distribution & CI Quality Gates (LOGHUB-PKG-007)
- **Zero-Registry Local Validation**: SDK packages are verified without publishing to public npm or PyPI registries. Tarballs (`.tgz`) and wheels (`.whl`) are built locally and verified in isolated consumer projects (`scripts/verify_isolated_browser_consumer.mjs` and `scripts/verify_isolated_python_consumer.py`).
- **Reproducible CI Verification Workflow**: Automated multi-OS/runtime verification defined in `.github/workflows/sdk-verification.yml`:
  1. *Schema & Contracts*: Schema synchronization verification and contract tests.
  2. *TypeScript SDKs*: Build, strict typecheck, and unit/integration tests across Core, Node, NestJS, Next.js, Browser, Angular, and React.
  3. *Python SDK Matrix*: Python 3.10, 3.11, and 3.12 tested across Ubuntu, Windows, and macOS.
  4. *Browser E2E Automation*: Real headless Chromium automated execution via Chrome DevTools Protocol.
  5. *Distribution Verification*: Clean isolated consumer installation testing packed artifacts.
- **Release Gating Discipline**: All 8 SDK foundation packages must pass compilation, typecheck, contract tests, and consumer verification before beginning centralized ingestion service development.

## 13. Ingestion Gateway Deployment & Durability Gates (LOGHUB-ING-001A)
- **Separate Liveness & Readiness Probes**:
  - `/health/live`: Returns 200 OK as long as the NestJS/Fastify process event loop is responsive.
  - `/health/ready`: Returns 200 OK **only if** the durable Write-Ahead Journal (WAL) volume is mounted, writable, and disk capacity is within safe thresholds. If WAL volume is unmounted or disk space is exhausted (`ENOSPC`), it returns `503 Service Unavailable` with diagnostic reason.
  - Kubernetes/orchestrator ingress must bind routing strictly to `/health/ready`, preventing traffic routing to un-persisted gateways.
- **Durability Prerequisite (Task ING-002 Gate)**:
  - During `LOGHUB-ING-002`, the gateway shell is implemented without the physical storage engine (`ING-003`). The gateway **must not** return false durable success acknowledgements. Ingestion routes return `503 STORAGE_NOT_READY` until `ING-003` mounts the WAL engine.
- Central Archive Volume Configuration:
  - Local NVMe volumes formatted with XFS or ext4 using `noatime,nodiratime` mount options for optimal WAL write and fsync throughput.
  - Enterprise SSDs with hardware Power-Loss Protection (PLP) are required for RPO = 0 crash durability.

## 14. Phase 2 Supported Deployment Topology & Operational Gates (LOGHUB-ING-006)
- **Single-Active-Writer Invariant**:
  - The MVP configuration requires **one active gateway writer per journal/archive storage domain**.
  - Enforced via `.journal.owner` file with atomic creation (`O_CREAT | O_EXCL`).
  - Active owner conflict blocks readiness (`/health/ready` returns 503). Stale locks from dead PIDs are automatically cleaned upon verified process termination.
  - Multi-host active-active write clustering to the same NFS/SMB volume is explicitly **not supported** for Phase 2 MVP.
- **Service Dependency & Startup Order**:
  1. PostgreSQL database running with migration `20261024000000_init_metadata` applied.
  2. Ingestion gateway (`apps/ingestion-gateway`) starts and acquires exclusive `.journal.owner` lease.
  3. Log shippers (`apps/log-shipper`) discover local SDK spools and begin delivery.
  4. Applications and proxies submit logs.
- **Graceful Shutdown**:
  - Ingestion gateway flushes in-memory WAL buffers, executes synchronous `fsync()`, releases `.journal.owner`, closes PostgreSQL pools, and drains connections within 10 seconds.

## 15. Phase 3 Query Service Deployment Architecture & Operational Controls (LOGHUB-QUERY-008)
- **Service Decoupling & Read-Only Invariants**:
  - `apps/query-service` operates as an independent NestJS microservice distinct from `apps/ingestion-gateway`.
  - Canonical archive directories (`ARCHIVE_ROOT`) must be mounted **read-only** (`ro`) for all query worker containers, providing OS-level write immunity.
  - Derived Parquet cache (`PARQUET_CACHE_ROOT`) requires read-write access for conversion workers and read-only access for pure query workers.
- **DuckDB Runtime Sandboxing**:
  - In-memory execution (`DuckDbInstanceManager`) with explicit memory limits (`DUCKDB_MAX_MEMORY=512MB` default) and worker thread caps (`DUCKDB_THREADS=2`).
  - Community and remote extension loading strictly disabled (`autoinstall_known_extensions: false`, `autoload_known_extensions: false`).
  - Raw filesystem access bounded by pre-read descriptor validation before DuckDB opens any files.
- **Multi-Tenant Concurrency & Fair-Share Governance**:
  - `QueryResourceGovernorService` limits concurrent queries (default 4 execution slots, 16 queued requests).
  - Per-tenant fair-share scheduling caps active execution slots (max 2 per tenant), preventing noisy neighbor saturation.
  - Client disconnections abort execution via DuckDB's native `conn.interrupt()` to release threads immediately.
- **Production Deployment Prerequisites (from `docs/query/12-PHASE3_OPERATIONS_GAPS.md`)**:
  - Corporate OIDC/JWKS identity provider configuration (fail-closed in production, replacing test mock tokens).
  - Read-only container volume mounts (`ro` on `/var/loghub/archive`).
  - Process cgroups memory limit (1.5x DuckDB configured budget) to prevent host OOM.
  - Dedicated conversion worker isolation or distributed lock for multi-replica deployments.



