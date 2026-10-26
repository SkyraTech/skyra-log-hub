# Prisma & Metadata Repository Standards

**Document Version:** 1.0.0  
**Status:** Approved Enterprise Architecture Baseline  
**Task Reference:** LOGHUB-ARCH-001  
**Scope:** Persistence Layer, Prisma Repositories, Database Transactions, and Migration Management

---

## 1. Role of PostgreSQL in Skyra LogHub

**PostgreSQL is strictly an administrative metadata and control-plane repository.**

### Non-Negotiable Storage Invariant
- **Allowed in PostgreSQL:** Tenant records, project definitions, scoped ingestion credentials, project quotas, archive segment manifests, deduplication receipts (7-day bounded), and ingestion checkpoints.
- **Strictly Prohibited in PostgreSQL:** Raw diagnostic log event bodies, user message strings, stack traces, or payload JSON. Storing raw log events in PostgreSQL violates the core file-first architecture and creates catastrophic database bloat.

---

## 2. Repository Pattern Architecture

Equivalent to Entity Framework Core repositories in .NET, Prisma repositories in Skyra LogHub isolate data access behind strongly typed port interfaces:

```text
Domain Port Interface (IReceiptRepository)
             ▲
             │ implements
             │
Prisma Adapter (PrismaReceiptRepository)
             │
             ▼ uses
Prisma Client / Service (PrismaService -> PostgreSQL)
```

### 2.1 Repository Design Rules
1. **Meaningful Operations:** Expose intent-driven methods (e.g. `findReceipt()`, `reconcileReceipts()`, `pruneExpiredReceipts()`), never generic unbounded CRUD methods.
2. **Domain Model Mapping:** Repositories accept and return domain record interfaces (`DeduplicationReceiptRecord`), never exposing raw Prisma model instances to application services.
3. **Explicit BigInt Conversion:** Prisma returns PostgreSQL `BIGINT` as JavaScript `bigint`. Repositories must explicitly serialize `bigint` into standard numbers or string representations at boundary points to prevent JSON serialization errors.
4. **Tenant Scoping:** Every query that filters by project or receipt must include `tenantId` in the `where` clause to guarantee multi-tenant data isolation at the database index level.

---

## 3. Transaction Management (`$transaction`)

When multiple metadata operations must be committed atomically, application services use Prisma's interactive transaction API:

```typescript
await this.prisma.$transaction(async (tx) => {
  // Step 1: Record archive segment
  await tx.archiveSegment.create({
    data: { id: segment.id, tenantId, projectId, ... },
  });

  // Step 2: Advance checkpoint offset
  await tx.ingestionCheckpoint.upsert({
    where: { tenantId_projectId: { tenantId, projectId } },
    update: { lastCommittedOffset: segment.lastOffset },
    create: { tenantId, projectId, lastCommittedOffset: segment.lastOffset },
  });
});
```

### Transaction Invariants
- **Keep Transactions Brief:** Do not perform file I/O, hashing, or network requests inside a Prisma `$transaction` callback.
- **Explicit Isolation:** Default PostgreSQL isolation level is `Read Committed`, which is sufficient for metadata receipts. Critical single-writer locks rely on application-level mutexes or PostgreSQL advisory locks.

---

## 4. Prisma Error Translation

Raw Prisma errors (such as `PrismaClientKnownRequestError`) must never bubble up to HTTP controllers or API responses. Repositories translate database error codes into domain-specific exceptions:

| Prisma Error Code | Meaning | Translated Domain Exception | HTTP Status |
| :--- | :--- | :--- | :--- |
| **`P2002`** | Unique constraint violation | `IdempotencyConflictException` or `DuplicateEntityException` | `409 Conflict` |
| **`P2003`** | Foreign key constraint failure | `InvalidReferenceException` (e.g. Project/Tenant missing) | `400 Bad Request` |
| **`P2025`** | Record to update/delete not found | `EntityNotFoundException` | `404 Not Found` |
| **`P1001` / `P1002`** | Database unreachable / timeout | `DatabaseUnavailableException` (marked retryable) | `503 Service Unavailable` |

---

## 5. Safe Database Migration Lifecycle

Database migrations in Skyra LogHub require strict human authorization and zero-downtime forward planning.

### Six-Step Migration Protocol
1. **Migration Review:** Inspect generated SQL in `prisma/migrations/<timestamp>_<name>/migration.sql` to ensure no raw event fields, no dropping of existing columns without deprecation, and no locks on large tables.
2. **Target Database Verification:** Confirm target database is strictly `skyra_loghub_dev` (or production equivalent) and role is unprivileged `skyra_loghub_user`. Under no circumstances may migrations target administrative databases or unrelated instances (e.g. `bachina_labs_academy`).
3. **Destructive Change Analysis:** Only additive DDL (new tables, new nullable columns, non-blocking indexes) is permitted in standard releases. Table drops require a multi-stage release cycle.
4. **Explicit User Authorization:** Automated tools must stop and request explicit user confirmation before executing `prisma migrate deploy`.
5. **Execution & Catalog Verification:** Run `pnpm exec prisma migrate deploy` and inspect `_prisma_migrations` to verify clean execution with exit code 0.
6. **Rollback & Disaster Recovery Plan:** Maintain reverse SQL scripts in documentation to restore state in the event of an operational failure.
