# Engineering Code Review & Architectural Checklist

**Document Version:** 1.0.0  
**Status:** Approved Enterprise Architecture Baseline  
**Task Reference:** LOGHUB-ARCH-001  
**Target Audience:** Software Engineers, Tech Leads, and Architectural Reviewers

---

## 1. Architectural & Structural Review

- [ ] **Layering Boundaries Respected:** Controllers contain zero SQL queries, file I/O, or business logic. Business logic resides in Application Services.
- [ ] **No Inverted Dependencies:** Domain logic does not import NestJS decorators, Fastify types, PrismaClient, or DuckDB.
- [ ] **No Cross-App Imports:** Applications in `apps/` do not import source files directly from other applications in `apps/`.
- [ ] **Contract-First Adherence:** Any new or modified public API endpoints are reflected in versioned OpenAPI 3.1 contracts and validated by `pnpm test:contracts`.
- [ ] **Single Responsibility Principle:** Classes and functions have focused, single-purpose roles ($\le 250$ lines for classes, $\le 30$ lines for functions).

---

## 2. Security & Multi-Tenant Isolation Review

- [ ] **Server-Enforced Scope:** Tenant and project boundaries are derived from the authenticated token/principal. No client-supplied `tenant_id` is trusted as an access grant.
- [ ] **Zero SQL String Interpolation:** SQL statements do not use template string concatenation (`${...}`). All queries use parameterized placeholders (`?` or `$1`).
- [ ] **Safe Path Resolution:** File paths are never assembled from raw user inputs. Catalog paths are checked against `ARCHIVE_ROOT` and verified against symlink escapes via `realpathSync`.
- [ ] **DuckDB Sandbox Active:** Embedded DuckDB connections execute `SET enable_external_access = false` and memory constraints upon initialization.
- [ ] **Sensitive Data Scrubbing:** Secrets, tokens, and authorization headers are scrubbed before storage. Error responses never leak file paths, database schemas, or stack traces.

---

## 3. Performance & Resource Governance Review

- [ ] **Stateless Singleton Providers:** NestJS services use default singleton scope unless request-scoping is explicitly justified.
- [ ] **No Unbounded Memory Growth:** In-memory queues enforce hard upper limits and priority eviction for critical events (`error`, `fatal`).
- [ ] **Timeouts & Cancellation:** Long-running I/O or DuckDB queries support cancellation via `AbortController` or interrupt signals.
- [ ] **No Event Payloads in PostgreSQL:** PostgreSQL is used strictly for metadata, receipts, and manifests. No raw diagnostic log event bodies are stored in database rows.
- [ ] **Deterministic Pagination:** Keyset cursor pagination (`(@timestamp, event.id)`) is used instead of expensive $O(N)$ SQL `OFFSET`.

---

## 4. Type Safety & TypeScript Hygiene Review

- [ ] **Strict Typing:** No `any` or `as any` type bypasses. Use `unknown` with runtime type guards where type is uncertain.
- [ ] **Prisma Entities Not Exposed:** Prisma database models are not returned directly as API responses; they are mapped to explicit Response DTOs.
- [ ] **No Unchecked Index Access:** Code safely checks array and dictionary lookups (`noUncheckedIndexedAccess: true`).
- [ ] **Immutable Types:** Use `readonly` for domain value objects and event interfaces where mutation should be prohibited.

---

## 5. Testing & Quality Gate Review

- [ ] **Unit Tests Included:** New business logic includes fast, isolated unit tests.
- [ ] **In-Memory Test Doubles:** Database-dependent logic provides an in-memory double (`InMemoryRepository`) for deterministic offline verification.
- [ ] **Contract Tests Passing:** `pnpm test:contracts` passes with 0 failures.
- [ ] **No Skipped Tests:** All tests run and pass without concealed skips.
- [ ] **Monorepo Typecheck Clean:** `pnpm run typecheck` exits with code 0 across all packages.
