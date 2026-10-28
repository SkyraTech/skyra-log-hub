# Skyra LogHub — documentation bundle

All 14 documents are **draft specifications** dated 2026-10-21, prepared for import into your renamed `skyra-loghub/docs` folder. They do not assert implementation or test completion. Review TBD decisions and existing repository before modifying code.

## Documentation Bundles

- [Enterprise Architecture Standards (`docs/architecture/`)](docs/architecture/) — Clean Architecture, SOLID, NestJS standards, Prisma standards, and compliance matrix.
- [Phase 2 Ingestion Documentation (`docs/ingestion/`)](docs/ingestion/) — Ingestion gateway, WAL durability, crash recovery, and acceptance report.
- [Phase 3 Query Documentation (`docs/query/`)](docs/query/) — Query architecture, Search API contracts, DuckDB/Parquet design, and threat model.
- [Phase 4 Web Console Documentation (`docs/console/`)](docs/console/) — Angular 19 architecture, UI/UX design tokens, screen specifications, and backend gaps.
- [Phase 4 Administration Documentation (`docs/admin/`)](docs/admin/) — Administration architecture, RBAC hierarchy, IAM models, credential lifecycle, OpenAPI contracts, and migration proposal.

## Recommended reading order

01 Product Requirements → 02 System Architecture → Enterprise Architecture Standards (`docs/architecture/`) → Ingestion (`docs/ingestion/`) → Query (`docs/query/`) → Web Console (`docs/console/`) → Administration (`docs/admin/`) → Tasks & Memory.

