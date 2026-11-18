# FEATURE-006 — Browser E2E acceptance

Date: 2026-11-06. **PASS — FEATURE-006 IMPLEMENTED IN ISOLATION.**

## Topology and provenance

Public Node SDK → managed credential → actual Gateway/nonowner PostgreSQL role → fsynced WAL → finalized JSONL/manifest and catalog → actual Query Service with Prisma/DuckDB and signed internal assertions → authenticated/CSRF BFF → production-built Angular Explorer. Controlled loopback OIDC uses real code exchange, S256 and RS256/JWKS; mock OIDC is disabled. The physical disposable PostgreSQL 17 cluster and marker are verified at port 5433; protected port 5432 is excluded from mutation runners.

Run: feature005-138064ca-dcab-4ac6-9652-c91723bfc618. Actual SDK cohort: **285 authorized events** (35 primary/recovery + 250 same-timestamp staging worker events), plus **five foreign-tenant events**. Five emitted severity levels, two services/environments and distinct traces are represented, with Unicode, long messages and nested attributes. These are real ingested events, not browser mocks. event-continuity.json reconciles exact IDs and canonical fields across SDK, CRC-verified WAL, catalogued archive and BFF Query; the primary 35 are additionally checked in every browser raw-detail view over two pages. The existing publisher enriches skyra.tenant_id from the authoritative WAL frame; reconciliation accounts for this server-owned addition. Zero missing/duplicate IDs or field mismatches. explorer-query-result.json retains the actual 285-event response.

## Final browser coverage

**69 Node tests passed, zero failed/cancelled/skipped; 68 leaf tests and one parent container.** These comprise 38 Organization/OIDC/Members/Projects regressions, one same-event FEATURE-005 browser chain, 17 Credentials regressions and 12 Explorer groups. Repeated debug/focused runs are not added to coverage totals.

Explorer groups prove API text/severity/service/environment/trace combinations, start-inclusive/end-exclusive UTC bounds, strict malformed input, complete 17-page traversal without missing or duplicate same-timestamp IDs, tampered and genuinely expired cursors, UI custom ranges/chips/reset/URL refresh, canonical details/copy/trace investigation/focus containment and return, actual bounded JSON download, unavailable archive warning and recovery, actual Query process stop/restart and Search retry, tenant/project and inactive membership/project denial, responsive accessibility, and established-session logout. The inherited same-event browser test also covers Previous/Next, page-size reset, keyboard opening, empty results and network error/retry.

All twelve Explorer scans (list **and** detail at 1440/768/390 pixels, light/dark) have **zero scoped Axe WCAG 2 A/AA and 2.1 AA violations**. Checks wait for finite theme/drawer transitions before measuring. No page-wide horizontal overflow; the table has its own scroll region. Fatal console errors: **0**. Desktop list and mobile detail screenshots were visually inspected, including tab spacing. Automated scans and these checks are not full WCAG certification.

Screenshots: [.tmp/feature006-evidence/explorer-1440-dark.png](.tmp/feature006-evidence/explorer-1440-dark.png), [mobile light](.tmp/feature006-evidence/explorer-390-light.png), [mobile detail](.tmp/feature006-evidence/explorer-390-light-detail.png). The directory contains all twelve screenshots and explorer-accessibility.json.

## Observed local performance

| Search | Rows | Authenticated round trip ms | Query execution ms | Files / estimated scanned bytes |
|---|---:|---:|---:|---:|
| unfiltered | 285 | 59.03 | 15 | 4 / 324717 |
| worker | 250 | 46.70 | 14 | 2 / 285190 |
| combined | 50 | 32.44 | 11 | 2 / 285190 |
| literal SQL-like input | 0 | 31.56 | 10 | 4 / 324717 |

Cursor traversal: **17 pages**, 32.00–42.16 ms per authenticated request. Round-trip timing includes the test helper's session/CSRF retrieval. Query statistics describe execution and scanned files/bytes; scanned-row and peak-memory measurements are unavailable. This is a bounded local 285-event observation, not production throughput, large-dataset capacity or an SLA.

## Regression results and reproduction

| Suite | Passed / skipped |
|---|---:|
| Node SDK | 54 / 0 |
| Gateway, including 21 live PostgreSQL checks | 124 / 0 |
| Query | 211 / 0 |
| Admin | 94 / 0 |
| BFF | 103 / 0 (102 leaves + parent) |
| Angular Console | 101 / 0 |
| Credential persistence | 29 / 0 (28 leaves + parent) |
| Canonical contracts | 61 / 0 |
| Isolated target guards | 15 / 0 |
| Full browser | 69 / 0 (68 leaves + parent) |
| Real SDK/WAL/archive pipeline integration | 1 / 0 |

Builds/typechecks, schema synchronization, Platform governance and Git whitespace validation pass. Use the installed compiler/test binaries; network package-manager version verification and Google font inlining are unavailable in the restricted environment. Console build command: ng build --configuration production,offline. See implementation report for guarded runner commands. Logs, measurements, exact IDs and audit are retained under .tmp/feature006-evidence/.
