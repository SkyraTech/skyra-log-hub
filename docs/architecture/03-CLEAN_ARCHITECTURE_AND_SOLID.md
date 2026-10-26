# Clean Architecture & SOLID Principles in Skyra LogHub

**Document Version:** 1.0.0  
**Status:** Approved Enterprise Architecture Baseline  
**Task Reference:** LOGHUB-ARCH-001  
**Scope:** Design Principles, Layering, and Code Smells

---

## 1. Clean Architecture Layering

Skyra LogHub implements Clean Architecture to ensure business logic remains testable, decoupled, and independent of databases, web frameworks, and third-party tools.

```text
       ┌─────────────────────────────────────────────────────────┐
       │                 API / Transport Layer                   │
       │       (NestJS Controllers, DTOs, Guards, Pipes)         │
       └────────────────────────────┬────────────────────────────┘
                                    │ Calls Use Cases
                                    ▼
       ┌─────────────────────────────────────────────────────────┐
       │               Application Services Layer                │
       │     (IngestionService, SearchService, ArchiveDiscovery) │
       │      Coordinates transactions, locks, and operations    │
       └──────────────┬───────────────────────────┬──────────────┘
                      │ Implements / Depends on   │ Uses
                      ▼                           ▼
       ┌────────────────────────────┐ ┌───────────────────────────┐
       │   Domain Layer / Models    │ │  Infrastructure Adapters  │
       │ (Port Interfaces, Schemas, │ │  (Prisma, WAL Writer,     │
       │  Canonical Events, Enums)  │ │   DuckDB, Local Storage)  │
       └────────────────────────────┘ └───────────────────────────┘
```

### Layer Responsibilities

1. **Domain Layer (Core):**
   - Contains pure business models, canonical event schema definitions, and repository port interfaces (`IReceiptRepository`, `IArchiveSegmentRepository`).
   - Zero external framework dependencies. No NestJS decorators, no PrismaClient references, no HTTP objects.
2. **Application Layer (Use Cases):**
   - Coordinates business workflows (e.g. `admitAndIngestBatch`, `searchLogs`, `reconcileReceipts`).
   - Enforces concurrency locks, idempotency verification, and transactional consistency.
   - Depends only on Domain Port interfaces via Dependency Inversion.
3. **Infrastructure Layer (Adapters):**
   - Concrete implementations of domain ports (e.g. `PrismaReceiptRepository`, `WalJournalService`, `DuckDbQueryAdapter`).
   - Handles physical I/O, database queries, file descriptor management, and network calls.
4. **API / Transport Layer (Delivery):**
   - Thin NestJS controllers, DTOs, route definitions, and HTTP status code mappings.
   - Delegates all processing immediately to Application Services.

---

## 2. SOLID Principles in TypeScript & NestJS

### 2.1 Single Responsibility Principle (SRP)
- **Rule:** A class or module must have one, and only one, reason to change.
- **Good Example:** `IngestionController` only parses HTTP requests and returns HTTP responses; `BatchValidationPipe` only validates schema rules; `WalJournalService` only handles binary framing and `fsync`; `ReceiptService` only checks deduplication receipts.
- **Anti-Pattern to Avoid:** A "God IngestionService" that opens database connections, parses JSON, writes to disk, logs errors, and manages HTTP responses in a single 2,000-line class.

### 2.2 Open/Closed Principle (OCP)
- **Rule:** Software entities should be open for extension, but closed for modification.
- **Good Example:** In `apps/ingestion-gateway`, caching deduplication receipts is defined by the `IReceiptCache` interface. The gateway supports `NullReceiptCache` (default offline) and `ValkeyReceiptCache` without modifying a single line of `IngestionService` logic.
- **Anti-Pattern to Avoid:** Hardcoding `if (useRedis) redis.get(...) else db.get(...)` throughout application use cases.

### 2.3 Liskov Substitution Principle (LSP)
- **Rule:** Subtypes or implementations must be substitutable for their base types without altering correctness.
- **Good Example:** `InMemoryReceiptRepository` behaves identically to `PrismaReceiptRepository` with respect to method contracts, return shapes, and error semantics, enabling 100% offline verification in unit tests.
- **Anti-Pattern to Avoid:** An in-memory double that throws `NotImplementedException` or returns different data shapes than the production database adapter.

### 2.4 Interface Segregation Principle (ISP)
- **Rule:** Clients should not be forced to depend upon interfaces they do not use.
- **Good Example:** The gateway defines focused repository interfaces (`IReceiptRepository`, `IArchiveSegmentRepository`, `ICheckpointRepository`) rather than a single monolithic `IDatabaseRepository`.
- **Anti-Pattern to Avoid:** A massive generic `IRepository<T>` exposing 40 unused CRUD methods (paging, bulk delete, graph traversal) when a service only needs `findReceipt()` and `saveReceipt()`.

### 2.5 Dependency Inversion Principle (DIP)
- **Rule:** High-level modules should not depend on low-level modules; both should depend on abstractions.
- **Good Example:** `IngestionService` does not instantiate or import `PrismaReceiptRepository`. Instead, it injects the abstract token `@Inject(RECEIPT_REPOSITORY) private readonly receipts: IReceiptRepository`.
- **Enforcement:** In NestJS, interface tokens are represented as unique `Symbol` instances:
  ```typescript
  export const RECEIPT_REPOSITORY = Symbol('RECEIPT_REPOSITORY');
  export interface IReceiptRepository { ... }
  ```

---

## 3. Detected Anti-Patterns & Engineering Remedies

| Anti-Pattern | Description in Legacy/Unstructured Code | Skyra LogHub Standard Remedy |
| :--- | :--- | :--- |
| **Fat Controllers** | Controllers running SQL queries, calculating hashes, or handling filesystem I/O. | Controllers restricted to $\le 50$ lines; strictly map DTOs to Application Services. |
| **Unchecked `any` Types** | Using `any` or `as any` to bypass TypeScript compile errors. | Enforce strict typing (`strict: true`, `noUncheckedIndexedAccess: true`). Use `unknown` with type guards. |
| **Leaky Database Entities** | Exposing raw Prisma model objects directly as HTTP API responses. | Map Prisma models to explicit API Response DTOs. Omit internal database IDs and salt hashes. |
| **Direct `process.env` Use** | Reading `process.env.FOO` deep inside application or domain logic. | Disallowed. All environment variables parsed and validated on startup via `GatewayConfigService`. |
| **Hidden Side-Effects** | Services performing un-awaited background file writes without error tracking. | All I/O must be awaited or managed via bounded, monitored queues with explicit error handlers. |
| **String Concatenation SQL** | Building SQL queries using template literals (`SELECT ... WHERE ${col} = '${val}'`). | Strictly prohibited. Use parameterized placeholders (`?`, `$1`) and allowlisted AST field compilers. |
