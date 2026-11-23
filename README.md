# Skyra LogHub

Enterprise distributed logging, ingestion, analytics, and audit platform for multi-tenant cloud environments.

## Authoritative Documentation Architecture

Skyra LogHub maintains a fixed, comprehensive documentation architecture consisting of exactly eight canonical technical documents in `docs/`:

1. [**01-FUNCTIONALITY.md**](docs/01-FUNCTIONALITY.md) — Product scope, personas, workflows, features, and operational limitations.
2. [**02-ARCHITECTURE.md**](docs/02-ARCHITECTURE.md) — System principles, monorepo structure, microservices, boundaries, and Mermaid diagrams.
3. [**03-DATABASE-ARCHITECTURE.md**](docs/03-DATABASE-ARCHITECTURE.md) — PostgreSQL models, Prisma schemas, relations, migrations, runtime roles, and ERD.
4. [**04-API-AND-CONTRACTS.md**](docs/04-API-AND-CONTRACTS.md) — OpenAPI endpoints, contracts, error models (RFC 7807), and SDK specifications.
5. [**05-SECURITY-ARCHITECTURE.md**](docs/05-SECURITY-ARCHITECTURE.md) — Threat model, OIDC, encrypted session persistence, IAM, CSRF, and dependency governance.
6. [**06-LOGGING-AND-STORAGE.md**](docs/06-LOGGING-AND-STORAGE.md) — Canonical event schema, WAL durability (`fsync`), Parquet compaction, and DuckDB querying.
7. [**07-UI-UX-ARCHITECTURE.md**](docs/07-UI-UX-ARCHITECTURE.md) — Angular 20 SPA, Skyra Platform custom elements, design tokens, signals, and workstation UX.
8. [**08-TESTING-AND-QUALITY.md**](docs/08-TESTING-AND-QUALITY.md) — Test suites, database isolation, quality commands, and milestone history.

## Development & Verification Commands

```bash
# Run full unit and integration test suite across all 12 workspace targets
pnpm test

# Full workspace TypeScript compilation check
pnpm typecheck

# Production AOT build for Angular Console
pnpm --filter console-web build

# Verify architectural boundary integrity (6 gates)
pnpm architecture:check

# Verify Skyra Platform design token & branding compliance
pnpm governance:check

# Verify documentation architecture & canonical link integrity
pnpm docs:check

# Production dependency security audit
pnpm audit --prod
```

## Repository Structure

```text
skyra-log-hub/
├── apps/
│   ├── console-web/         # Angular 20 SPA
│   ├── console-bff/         # NestJS 11 / Fastify 5 BFF
│   ├── admin-service/       # NestJS 11 / Fastify 5 IAM & Administration
│   ├── ingestion-gateway/   # NestJS 11 / Fastify 5 Ingestion & WAL
│   ├── query-service/       # NestJS 11 / Fastify 5 DuckDB Columnar Query Engine
│   └── log-shipper/         # WAL Flusher & Parquet Compaction Daemon
├── packages/
│   ├── shared-contracts/    # Canonical Schemas, OpenAPI Specs, DTOs
│   ├── logger-node/         # Node.js Client
│   ├── logger-nestjs/       # NestJS Logger
│   ├── logger-next/         # Next.js Logger
│   ├── logger-browser/      # Browser Logger
│   ├── logger-angular/      # Angular Logger
│   ├── logger-react/        # React Logger
│   └── logger-python/       # Python Logger
└── docs/                    # Authoritative Canonical Specifications
```

