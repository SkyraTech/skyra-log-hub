# @skyra/query-service

Enterprise Analytical Query & Search Service for Skyra LogHub.

Established in **Task LOGHUB-QUERY-002**, extended in **Task LOGHUB-QUERY-003** (Secure DuckDB JSONL Query Execution), productionized in **Task LOGHUB-QUERY-004** (Secure Search API, Deterministic Keyset Pagination), and completed with analytical capabilities in **Task LOGHUB-QUERY-005** (Secure Aggregations, Dynamic Facets & Bounded Analytical Query Execution).

---

## 1. Overview

The Skyra Query Service provides an independent, secure backend for analytical querying and discovery of archived log events across Skyra LogHub.

Built with **NestJS 10** and the high-performance **Fastify** HTTP adapter, it enforces:
- **Clean Architecture & SOLID Principles**: Pure domain models (`src/modules/*/domain/`) completely decoupled from NestJS, Prisma, Fastify, and DuckDB. Thin controllers (<= 120 lines).
- **DuckDB Analytical Execution Layer**: High-performance in-memory analytical query engine utilizing `@duckdb/node-api` to scan canonical JSONL archive segments directly (`src/modules/query-execution/`).
- **Pre-Read Tenant & Filesystem Isolation (P0-A & P0-B)**: Mandatory pre-read security gate validating descriptor ownership, project scope, manifest checksum parity, canonical root containment, and physical file identity *before* DuckDB opens or executes any file. Foreign or forged descriptors fail closed.
- **Physical Record Locator Determinism (P0-A Correction)**: Multi-threaded scans enforce inner ordering inside `row_number() OVER (PARTITION BY filename ORDER BY json_extract_string(json, '$."@timestamp"'), json_extract_string(json, '$.event.id'), md5(json))` to ensure physically stable record positioning under multi-worker execution.
- **Analytical Aggregations API (`POST /query/v1/logs/aggregate`)**: High-performance grouped analytics supporting `date_histogram` (with strict UTC bucket alignment for `1m`, `5m`, `15m`, `1h`, `6h`, `1d`), categorical `terms` (bounded counts with explicit `size` limits), and distinct count `cardinality` aggregations conforming to `aggregate-request.schema.json`.
- **Dynamic Facet Discovery API (`POST /query/v1/logs/facets`)**: Authoritative, scoped discovery of distinct values and frequencies for `service.name`, `log.level`, `event.action`, `environment`, and `error.type` conforming to `facets-request.schema.json`.
- **Stable Total Ordering & Keyset Pagination**: 4-part composite locator tuple `(@timestamp, event.id, segment.id, record_offset)` providing a deterministic total order across gateway/service restarts and archive scans without skipping or duplicating records.
- **Tamper-Evident HMAC-SHA256 Cursors**: Opaque, signed cursors (`CursorCodecService`) binding schema version ("1.0"), tenant scope, query fingerprint, sort direction, full position tuple, and expiration. Verified with `crypto.timingSafeEqual`.
- **Authoritative Contract Schema Validation**: Strict runtime validation of incoming requests (`AggregateValidationPipe`, `FacetsValidationPipe`, `SearchValidationPipe`) rejecting unknown properties, non-UTC timestamps, invalid boundaries, excessive time ranges (>30 days), excessive histogram buckets (>2000), and unallowlisted fields.
- **Single Event Point-Lookup**: Bounded, scoped event retrieval (`GET /query/v1/logs/:eventId`) requiring authorized `projectId`, supporting optional UTC `date` partition hints, and returning canonical log events.
- **Query Resource Governance**: Concurrency ceilings (max 4 concurrent queries), queue depth limits (max 16), per-tenant fairness (max 2 active slots per tenant), and execution duration enforcement.
- **True Interrupt Cancellation**: Timeout or client `AbortSignal` invokes `conn.interrupt()` to immediately halt DuckDB thread execution and release resources.
- **Structured Filter Compiler**: Validates canonical ECS field allowlists (`docs/query/10-CANONICAL_FIELD_MAPPING.md`), bounds string lengths (<= 512 chars) and array sizes (<= 100 items), and compiles typed ASTs.
- **Safe Parameterized SQL Generation**: Translates query plans to DuckDB SQL where dynamic filter values and trusted filesystem paths are bound using prepared parameters ($1, $2, ...), preventing SQL injection.
- **JWT & Pluggable Authentication**: Verifies signed JWT tokens (HS256, RS256, EdDSA/Ed25519) and provides a deterministic test token verifier (`test-token:<base64-json>`) in non-production environments.
- **Read-Only Metadata Repository**: Dual-mode storage adapter using either PostgreSQL via Prisma (`PrismaArchiveSegmentRepository`) or zero-dependency in-memory mock (`InMemoryArchiveSegmentRepository`).
- **Cryptographic Manifest Verification**: Verifies SHA-256 digests and byte counts against authoritative archive manifests before query handoff (`ManifestVerifierService`).
- **RFC 7807 Problem Details**: Centralized, standardized JSON error responses with `type`, `title`, `status`, `detail`, `instance`, `code`, and `invalid_params` fields (`ProblemDetailsFilter`).
- **Audit Logging & Security Telemetry**: Structured audit logging for authentication, discovery, query planning, search execution, point lookups, aggregations, facets, and security violations (`QueryAuditService`).
- **Liveness & Readiness Probes**: `/health/live` and `/health/ready` endpoints reporting subsystem health without leaking configuration secrets.

---

## 2. Invariants & Security Guarantees

1. **Pre-Read Tenant & Scope Isolation (P0-A & P0-B)**: DuckDB NEVER opens or accesses a file belonging to an unauthorized tenant or project. Pre-read descriptor validation verifies ownership, scope, and integrity before SQL generation.
2. **Stable Total Ordering**: Every query orders rows by `(@timestamp, event.id, segment.id, record_offset)`. No identical timestamps or event IDs can cause non-deterministic skips or repeats during keyset traversal.
3. **Tamper-Resistant Cursors**: Pagination cursors are signed using a server-side HMAC-SHA256 secret. Altering position, tenant, or query parameters invalidates the cryptographic signature.
4. **Physical Path Leakage Defense**: Public API responses NEVER expose internal server filepaths (`resolvedPath`) to API clients. Physical paths remain encapsulated inside internal domain descriptors.
5. **Fail-Closed Authorization**: A principal with empty project memberships cannot access any data. If requested projects contain any project outside authorized membership, the entire request is rejected with HTTP 403 Forbidden.
6. **Path Traversal Containment**: All segment paths must reside strictly within `ARCHIVE_ROOT`. Any relative traversal (`..`), illegal character sets, or non-canonical file extensions trigger an immediate HTTP 400/403 security error.
7. **Least-Privilege DuckDB Runtime**: DuckDB instance runs in-memory with `autoinstall_known_extensions: 'false'`, `autoload_known_extensions: 'false'`, restricted memory budget (default 256MB), and bounded threads (default 2).

---

## 3. Endpoints

| Method | Route | Auth Required | Description | Status Code |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/health/live` | No | Liveness probe indicating process event loop responsiveness | `200 OK` |
| `GET` | `/health/ready` | No | Readiness probe checking PostgreSQL and archive root accessibility | `200 OK` or `503 Service Unavailable` |
| `POST` | `/query/v1/archive/discover` | Yes (`Bearer <token>`) | Secure discovery and verification of archive segments | `200 OK`, `400`, `401`, or `403` |
| `POST` | `/query/v1/logs/search` | Yes (`Bearer <token>`) | Production Log Search API with structured filters and signed cursor pagination | `200 OK`, `400`, `401`, `403`, `422` |
| `GET` | `/query/v1/logs/:eventId` | Yes (`Bearer <token>`) | Single event point-lookup scoped to authorized project | `200 OK`, `400`, `401`, `403`, `404` |
| `POST` | `/query/v1/logs/aggregate` | Yes (`Bearer <token>`) | Production analytical aggregations (date histogram, terms, cardinality) | `200 OK`, `400`, `401`, `403`, `422` |
| `POST` | `/query/v1/logs/facets` | Yes (`Bearer <token>`) | Dynamic facet discovery for dashboard and filter dropdowns | `200 OK`, `400`, `401`, `403` |
| `GET` | `/query/v1/logs/aggregate` | Yes (`Bearer <token>`) | Explicitly rejected (RFC 7807) | `405 Method Not Allowed` |
| `GET` | `/query/v1/logs/facets` | Yes (`Bearer <token>`) | Explicitly rejected (RFC 7807) | `405 Method Not Allowed` |

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
| `CURSOR_SIGNING_SECRET` | *(dev key)* | HMAC-SHA256 cursor signing secret (min 32 chars in production) |
| `CURSOR_SIGNING_KEY_ID` | `v1` | Identifier for active cursor signing key |
| `CURSOR_TTL_MS` | `86400000` | Cursor expiration window (default 24 hours) |
| `QUERY_TIMEOUT_MS` | `30000` | Query execution deadline |
| `MAX_SEGMENTS_PER_QUERY` | `500` | Maximum archive segments per query window |
| `MAX_TIME_RANGE_DAYS` | `30` | Maximum query time window span |
| `MAX_ROWS_PER_QUERY` | `500` | Maximum rows returned per query page |
| `ENABLE_AUDIT_LOGGING` | `true` | Security audit event logging |
| `CORS_ORIGINS` | `*` | Allowed CORS origins (comma-separated) |

---

## 5. Development & Testing

```bash
# Run all Query Service tests (unit, integration, security, architecture) - 116 tests across 19 suites
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
