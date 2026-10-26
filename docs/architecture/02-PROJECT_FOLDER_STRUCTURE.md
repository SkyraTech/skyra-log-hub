# Project Folder Structure & Module Boundary Standards

**Document Version:** 1.0.0  
**Status:** Approved Enterprise Architecture Baseline  
**Task Reference:** LOGHUB-ARCH-001  
**Scope:** Monorepo Hierarchy, Application Packages, and Future Services

---

## 1. Monorepo Root Organization

The Skyra LogHub workspace uses pnpm workspaces (`pnpm-workspace.yaml`). Code is categorized strictly by lifecycle and deployment target:

```text
skyra-log-hub/
├── apps/                        # Standalone runnable applications & daemons
│   ├── ingestion-gateway/       # NestJS/Fastify durable ingestion service (Phase 2)
│   ├── log-shipper/             # Standalone JSONL shipping daemon (Phase 2)
│   └── query-service/           # NestJS/DuckDB analytical search service (Phase 3 planned)
│
├── packages/                    # Reusable libraries & framework logging SDKs
│   ├── logger-core/             # Canonical schema types, Ajv validator, redaction engine
│   ├── logger-node/             # Node.js file logger, daily rotation, single-writer lock
│   ├── logger-python/           # Python standard logging integration & JSONL spooler
│   ├── logger-nestjs/           # NestJS module, middleware, and interceptors
│   ├── logger-next/             # Next.js App Router & Server Actions wrappers
│   ├── logger-browser/          # Pure browser ESM SDK, sendBeacon, global error capture
│   ├── logger-angular/          # Angular standalone DI providers & error handlers
│   └── logger-react/            # React context, ErrorBoundary, navigation tracker
│
├── contracts/                   # Versioned schemas and machine-readable API contracts
│   ├── schemas/v1/              # Canonical ECS log event schema (log-event.schema.json)
│   ├── ingestion/v1/            # Ingestion batch OpenAPI & JSON schemas
│   ├── query/v1/                # Phase 3 Query OpenAPI, search, aggregate & cursor schemas
│   └── fixtures/                # Canonical test fixtures (cross-SDK compliance suites)
│
├── docs/                        # Architectural documentation, ADRs, and operation guides
│   ├── architecture/            # Enterprise standards, Clean Architecture, compliance matrix
│   ├── ingestion/               # Phase 2 durability, recovery, and acceptance specs
│   └── query/                   # Phase 3 query engine, Parquet design, threat model
│
├── scripts/                     # Operational automation, schema sync, consumer verification
├── tests/                       # Monorepo-wide contract, E2E, and cross-SDK integration suites
├── package.json                 # Monorepo workspace configuration & root scripts
├── pnpm-workspace.yaml          # Workspace member definitions
└── tsconfig.base.json           # Shared strict TypeScript compiler configuration
```

---

## 2. Standard NestJS Backend Service Structure

All backend microservices (including the existing `apps/ingestion-gateway` and the upcoming `apps/query-service`) must adhere to a feature-first modular architecture inspired by Clean Architecture:

```text
apps/<service-name>/
├── src/
│   ├── main.ts                  # Application bootstrap, Fastify setup, global filters/pipes
│   ├── app.module.ts            # Root module assembling feature modules
│   │
│   ├── config/                  # Configuration management & environment parsing
│   │   ├── config.module.ts     # ConfigModule definition
│   │   ├── <name>-config.service.ts # Strongly typed config accessor
│   │   └── environment.schema.ts    # Ajv or class-validator environment schema
│   │
│   ├── common/                  # Cross-cutting framework adapters (no business logic)
│   │   ├── decorators/          # Custom parameter decorators (@CurrentIdentity)
│   │   ├── errors/              # Domain and HTTP error classes
│   │   ├── filters/             # Exception filters (RFC 7807 ProblemDetailsFilter)
│   │   ├── guards/              # Authentication & rate limiting guards
│   │   ├── interceptors/        # Monotonic duration & correlation interceptors
│   │   └── pipes/               # Input parsing & canonical validation pipes
│   │
│   ├── modules/                 # Bounded context feature modules
│   │   └── <feature-name>/      # e.g., auth, log-search, aggregations, archive-discovery
│   │       ├── api/             # Transport/Delivery Layer (Controllers, DTOs)
│   │       │   ├── <feature>.controller.ts
│   │       │   └── dto/
│   │       │       ├── <action>-request.dto.ts
│   │       │       └── <action>-response.dto.ts
│   │       │
│   │       ├── application/     # Application Use Cases & Coordination Services
│   │       │   ├── <feature>.service.ts
│   │       │   └── use-cases/
│   │       │
│   │       ├── domain/          # Core Business Logic & Port Interfaces
│   │       │   ├── models/      # Domain entities & value objects
│   │       │   └── ports/       # Repository and engine port interfaces
│   │       │
│   │       ├── infrastructure/  # External Adapters (Prisma, DuckDB, Filesystem)
│   │       │   ├── repositories/ # Concrete database repositories
│   │       │   └── adapters/     # Engine or external client adapters
│   │       │
│   │       └── <feature>.module.ts # Feature module declaring providers & exports
│   │
│   └── metadata/                # Shared metadata persistence (Prisma client & repositories)
│       ├── prisma.service.ts    # Prisma lifecycle wrapper
│       └── repositories/        # Metadata repositories implementing shared domain ports
│
├── prisma/                      # Database migrations and schema definition
│   ├── schema.prisma            # Prisma schema models
│   └── migrations/              # Versioned SQL migration directories
│
├── tests/                       # Service-specific automated test suites
│   ├── unit/                    # Fast isolated unit tests (*.test.ts)
│   ├── integration/             # Integration tests (with in-memory/live DB doubles)
│   └── security/                # Penetration, authorization, and boundary tests
│
├── tsconfig.json                # Service-specific TypeScript config extending root
├── tsconfig.test.json           # Test compilation config
├── README.md                    # Service architecture, env variables, runbooks
└── package.json                 # Service package definition & script entries
```

---

## 3. Standard Query Service Layout (`apps/query-service`)

For the upcoming `LOGHUB-QUERY-002` foundation task, the query service structure is established as:

```text
apps/query-service/src/
├── main.ts
├── app.module.ts
├── config/
│   ├── query-config.service.ts
│   └── query-config.module.ts
├── common/
│   ├── filters/problem-details.filter.ts
│   ├── guards/query-auth.guard.ts
│   └── interceptors/query-audit.interceptor.ts
├── modules/
│   ├── auth/                    # Pluggable JWT / test-principal authenticator
│   ├── archive-discovery/       # PostgreSQL-backed partition pruner & path containment
│   │   ├── discovery.service.ts
│   │   └── path-safety.validator.ts
│   ├── duckdb/                  # In-memory DuckDB connection pool & sandbox manager
│   │   ├── duckdb-pool.service.ts
│   │   └── duckdb-query.adapter.ts
│   ├── search/                  # Log search API & keyset cursor pagination
│   │   ├── search.controller.ts
│   │   ├── search.service.ts
│   │   └── cursor-codec.service.ts
│   ├── aggregations/            # Time-series & multi-bucket analytical aggregations
│   │   ├── aggregate.controller.ts
│   │   └── aggregate.service.ts
│   └── health/                  # Liveness and readiness probes
│       ├── health.controller.ts
│       └── health.service.ts
└── metadata/                    # Read-only Prisma metadata repositories
    ├── prisma.service.ts
    └── repositories/
```

---

## 4. File Naming Conventions

All files across the repository must follow strict kebab-case naming reflecting their architectural role:

| Architectural Component | File Naming Pattern | Example |
| :--- | :--- | :--- |
| **Controller** | `<feature>.controller.ts` | `ingestion.controller.ts`, `search.controller.ts` |
| **Service (Application)** | `<feature>.service.ts` | `ingestion.service.ts`, `discovery.service.ts` |
| **Module** | `<feature>.module.ts` | `ingestion.module.ts`, `auth.module.ts` |
| **Repository Interface** | `<entity>.repository.interface.ts` | `receipt.repository.interface.ts` |
| **Repository Implementation** | `prisma-<entity>.repository.ts` | `prisma-receipt.repository.ts` |
| **In-Memory Repository Double** | `in-memory-<entity>.repository.ts` | `in-memory-receipt.repository.ts` |
| **Request DTO** | `<action>-request.dto.ts` | `batch-request.dto.ts`, `search-request.dto.ts` |
| **Response DTO** | `<action>-response.dto.ts` | `batch-response.dto.ts`, `search-response.dto.ts` |
| **Guard** | `<purpose>.guard.ts` | `auth.guard.ts`, `rate-limit.guard.ts` |
| **Pipe** | `<purpose>.pipe.ts` | `batch-validation.pipe.ts` |
| **Interceptor** | `<purpose>.interceptor.ts` | `query-audit.interceptor.ts` |
| **Filter** | `<purpose>.filter.ts` | `problem-details.filter.ts` |
| **Unit Test** | `<name>.test.ts` | `batch-builder.test.ts` |
| **Integration Test** | `<feature>.integration.test.ts` | `live-postgresql.test.ts` |

---

## 5. Dependency Direction Rules

Dependencies between layers must flow strictly inward toward the domain:

$$\text{API (Controllers, DTOs)} \longrightarrow \text{Application (Services, Use Cases)} \longleftarrow \text{Infrastructure (Prisma, DuckDB, FS)}$$
$$\text{Application Services} \longrightarrow \text{Domain Interfaces / Ports (Repositories)}$$

### Forbidden Import Boundaries:
1. **Controllers must never import PrismaClient or DuckDB directly.**
2. **Domain logic must never import NestJS framework decorators (`@Injectable()`, `@Controller()`) or HTTP types.**
3. **Packages (`packages/*`) must never import application code (`apps/*`).**
4. **Browser SDK (`packages/logger-browser`) must never import Node.js built-ins (`fs`, `path`, `crypto`, `os`).**
5. **Query Service (`apps/query-service`) must never import Ingestion Gateway internal modules.**
