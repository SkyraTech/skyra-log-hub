# @skyra/query-service

Enterprise Analytical Query & Search Service for Skyra LogHub.

Established in **Task LOGHUB-QUERY-002** and extended in **Task LOGHUB-QUERY-003** (Secure DuckDB JSONL Query Execution, Structured Filtering & Resource Governance).

---

## 1. Overview

The Skyra Query Service provides an independent, secure backend for analytical querying and discovery of archived log events across Skyra LogHub.

Built with **NestJS 10** and the high-performance **Fastify** HTTP adapter, it enforces:
- **Clean Architecture & SOLID Principles**: Pure domain models (`src/modules/*/domain/`) completely decoupled from NestJS, Prisma, Fastify, and DuckDB.
- **DuckDB Analytical Execution Layer**: High-performance in-memory analytical query engine utilizing `@duckdb/node-api` to scan canonical JSONL archive segments directly (`src/modules/query-execution/`).
- **Query Execution Port & Adapter**: Clean Architecture port `ILogQueryExecutionPort` (`LOG_QUERY_EXECUTION_PORT`) implemented by infrastructure adapter `DuckDbLogQueryAdapter`.
- **Query Resource Governance**: Concurrency ceilings (max 4 concurrent queries), queue depth limits (max 16), per-tenant fairness (max 2 active slots per tenant), and execution duration enforcement.
- **True Interrupt Cancellation**: Timeout or client `AbortSignal` invokes `conn.interrupt()` to immediately halt DuckDB thread execution and release resources.
- **Fail-Closed Tenant & Project Isolation**: Principals can only access archive segments for tenants and projects they are explicitly authorized for. Double defense-in-depth enforces row-level `skyra.tenant_id` and `skyra.project_id` matching in DuckDB queries.
- **Deterministic Bounded Pagination Readiness**: Stable sorting by `@timestamp DESC, event.id DESC` providing a deterministic tie-breaker for Phase 3 keyset pagination in QUERY-004.
- **Structured Filter Compiler**: Validates canonical ECS field allowlists (`docs/query/10-CANONICAL_FIELD_MAPPING.md`), enforces operator compatibility, bounds string lengths (<= 512 chars) and array sizes (<= 100 items), and compiles typed ASTs.
- **Safe Parameterized SQL Generation**: Translates query plans to DuckDB SQL where dynamic filter values and trusted filesystem paths are bound using prepared parameters ($1, $2, ...), preventing SQL injection.
- **JWT & Pluggable Authentication**: Verifies signed JWT tokens (HS256, RS256, EdDSA/Ed25519) and provides a deterministic test token verifier (`test-token:<base64-json>`) in non-production environments.
- **Read-Only Metadata Repository**: Dual-mode storage adapter using either PostgreSQL via Prisma (`PrismaArchiveSegmentRepository`) or zero-dependency in-memory mock (`InMemoryArchiveSegmentRepository`).
- **Filesystem Path Safety & Containment**: Canonical root resolution, strict partition character filtering, and rejection of path traversal (`..`), absolute path escapes, and symlink/junction redirection attacks (`PathSafetyService`).
- **Cryptographic Manifest Verification**: Verifies SHA-256 digests and byte counts against authoritative archive manifests before query handoff (`ManifestVerifierService`).
- **RFC 7807 Problem Details**: Centralized, standardized JSON error responses with `type`, `title`, `status`, `detail`, `instance`, `code`, and `invalid_params` fields (`ProblemDetailsFilter`).
- **Request Correlation & Duration Tracking**: `CorrelationIdMiddleware` assigns or propagates `x-correlation-id` and `x-request-id`; `AuditLoggingInterceptor` records duration in `x-response-time-ms`.
- **Audit Logging & Security Telemetry**: Structured audit logging for authentication, discovery, query planning, execution, and security violations (`QueryAuditService`).
- **Liveness & Readiness Probes**: `/health/live` and `/health/ready` endpoints reporting subsystem health without leaking configuration secrets.
- **Zero Mock Analytical Search Responses**: Public search endpoints remain safely guarded for contract integration in task LOGHUB-QUERY-004.

---

## 2. Invariants & Security Guarantees

1. **Physical Path Leakage Defense**: Public discovery responses (`DiscoverArchiveSegmentsResponseDto`) NEVER expose internal server filepaths (`resolvedPath`) to API clients. Physical paths remain encapsulated inside the internal domain descriptor (`TrustedArchiveSegmentDescriptor`) for internal analytical engine handoff.
2. **Fail-Closed Authorization**: A principal with empty project memberships cannot access any data. If requested projects contain any project outside authorized membership, the entire request is rejected with HTTP 403 Forbidden.
3. **Cross-Tenant Hard Boundary**: Access attempts targeting a tenant ID different from the token's authenticated tenant boundary fail immediately with HTTP 403 Forbidden. Client-supplied tenant IDs cannot override server-verified token claims.
4. **Path Traversal Containment**: All segment paths must reside strictly within `ARCHIVE_ROOT`. Any relative traversal (`..`), illegal character sets, or non-canonical file extensions (`.jsonl`, `.parquet` only) trigger an immediate HTTP 400 security error. Realpath resolution verifies symlink/junction targets do not escape the archive root.
5. **No Client-Controlled DuckDB File Paths**: DuckDB queries accept only server-verified filesystem paths from `TrustedArchiveSegmentDescriptor` objects verified by `PathSafetyService` and `ManifestVerifierService`.
6. **Least-Privilege DuckDB Runtime**: DuckDB instance runs in-memory with `autoinstall_known_extensions: 'false'`, `autoload_known_extensions: 'false'`, restricted memory budget (default 256MB), and bounded threads (default 2).
7. **No Production Test Auth**: In `production` environment, `QUERY_AUTH_MODE=test` or placeholder credentials trigger immediate, fail-fast process termination during bootstrap.

---

## 3. Endpoints

| Method | Route | Auth Required | Description | Status Code |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/health/live` | No | Liveness probe indicating process event loop responsiveness | `200 OK` |
| `GET` | `/health/ready` | No | Readiness probe checking PostgreSQL and archive root accessibility | `200 OK` or `503 Service Unavailable` |
| `POST` | `/query/v1/archive/discover` | Yes (`Bearer <token>`) | Secure discovery and verification of archive segments | `200 OK`, `400`, `401`, or `403` |
| `POST` / `GET` | `/query/v1/logs/search` | Yes (`Bearer <token>`) | Public Search API & pagination contract integration (scheduled for QUERY-004) | `501 Not Implemented` (RFC 7807) |
| `GET` | `/query/v1/logs/:eventId` | Yes (`Bearer <token>`) | Single event point lookup (scheduled for QUERY-004) | `501 Not Implemented` (RFC 7807) |
| `POST` / `GET` | `/query/v1/logs/aggregate` | Yes (`Bearer <token>`) | Analytical aggregations (scheduled for QUERY-004) | `501 Not Implemented` (RFC 7807) |
| `POST` / `GET` | `/query/v1/logs/facets` | Yes (`Bearer <token>`) | Faceted attribute discovery (scheduled for QUERY-004) | `501 Not Implemented` (RFC 7807) |

---

## 4. Configuration Reference

Environment variables parsed and validated at service startup:

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `NODE_ENV` | `development` | Operating environment (`development`, `production`, `test`) |
| `PORT` | `3100` | HTTP port |
| `HOST` | `127.0.0.1` | Network binding host (loopback by default) |
| `DATABASE_URL` | `postgresql://...` | PostgreSQL connection string |
| `ARCHIVE_ROOT` | `./data/archive` | Canonical root path for log archives |
| `QUERY_AUTH_MODE` | `test` (or `jwt` in prod) | Authentication mode (`jwt`, `test`, `jwks`) |
| `JWT_ISSUER` | `https://auth.skyra.internal` | Expected JWT issuer (`iss`) |
| `JWT_AUDIENCE` | `skyra-loghub-query` | Expected JWT audience (`aud`) |
| `JWT_SECRET_OR_PUBLIC_KEY` | *(dev key)* | Verification secret or PEM public key |
| `QUERY_TIMEOUT_MS` | `30000` | Query execution deadline |
| `MAX_SEGMENTS_PER_QUERY` | `500` | Maximum archive segments per query window |
| `MAX_TIME_RANGE_DAYS` | `30` | Maximum query time window span |
| `ENABLE_AUDIT_LOGGING` | `true` | Security audit event logging |
| `CORS_ORIGINS` | `*` | Allowed CORS origins (comma-separated) |

---

## 5. Clean Architecture Layering

```text
apps/query-service/src/
├── main.ts                                  # NestJS/Fastify bootstrap
├── app.module.ts                            # Root DI module, global filters, middleware
├── config/                                  # Configuration module & typed validation
├── common/                                  # Cross-cutting concerns
│   ├── decorators/                          # @CurrentPrincipal() parameter decorator
│   ├── errors/                              # RFC 7807 Domain Exceptions
│   ├── filters/                             # ProblemDetailsFilter (RFC 7807)
│   ├── guards/                              # QueryAuthGuard (Bearer verification)
│   ├── interceptors/                        # AuditLoggingInterceptor (timing & telemetry)
│   ├── middleware/                          # CorrelationIdMiddleware
│   └── pipes/                               # DiscoveryValidationPipe (strict DTO validation)
├── metadata/                                # Shared Prisma Client lifecycle
└── modules/
    ├── audit/                               # Security & operational audit logging
    ├── auth/                                # Authentication & project authorization
    │   ├── application/                     # JwtVerificationService, TestTokenVerifier
    │   ├── authorization/                   # ProjectAuthorizationService & Port
    │   └── domain/                          # Principal model, TokenVerificationPort
    ├── archive-discovery/                   # Core archive discovery & verification
    │   ├── api/                             # Thin Controller & request/response DTOs
    │   ├── application/                     # ArchiveDiscoveryService, ManifestVerifierService
    │   ├── domain/                          # TrustedArchiveSegmentDescriptor, Repository Interface
    │   └── infrastructure/                  # PathSafetyService, PrismaRepo, InMemoryRepo
    ├── health/                              # Liveness & Readiness health checks
    └── search/                              # Contract-compliant 501 Not Implemented stubs
```

### Clean Architecture Invariants
- `Domain` layer does NOT import `@nestjs`, `@prisma`, `fastify`, or `node:fs`.
- `Controllers` contain zero business logic and zero Prisma database queries.
- `Public DTOs` never expose internal disk paths (`resolvedPath`).
- `Services` communicate via ports (`ARCHIVE_SEGMENT_REPOSITORY`, `PROJECT_AUTHORIZATION_PORT`, `TOKEN_VERIFICATION_PORT`).

---

## 6. DuckDB Handoff Security Gate (QUERY-003 Preparation)

1. **Trusted Descriptor Contract**: The internal descriptor (`TrustedArchiveSegmentDescriptor`) is produced strictly after:
   - Server-enforced principal authentication
   - Server-derived project authorization
   - Canonical root containment verification via `path.resolve` and `fs.realpathSync`
   - Cryptographic manifest verification (SHA-256 and byte size)
2. **Execution Disabled**: Direct DuckDB SQL execution remains strictly disabled in QUERY-002 until QUERY-003 implements safe file list binding and hardened engine settings (`enable_external_access = false`).

---

## 7. Development & Testing

```bash
# Run all Query Service tests (unit, integration, security, architecture)
pnpm --filter @skyra/query-service test

# Run unit tests only
pnpm --filter @skyra/query-service test:unit

# Run integration tests only
pnpm --filter @skyra/query-service test:integration

# Run security & architecture tests only
pnpm --filter @skyra/query-service test:security

# Typecheck Query Service
pnpm --filter @skyra/query-service exec tsc --noEmit

# Build production bundle
pnpm --filter @skyra/query-service build
```
