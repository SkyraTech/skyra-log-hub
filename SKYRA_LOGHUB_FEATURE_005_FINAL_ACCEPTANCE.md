# FEATURE-005 — Final acceptance

Date: 2026-11-05. **PASS — FEATURE-005 IMPLEMENTED IN ISOLATION.**

Final run: `feature005-4932f35e-72d0-4a66-8c22-848cda0e3e14`. Evidence: `.tmp/feature005-evidence/acceptance-manifest.json`, `final-audit.json`, `pipeline.log` and `browser.log`.

## 1–4. Inherited work and implementation

Continued the original FEATURE-005 SDK HTTP draft, transport exports and public factory injection. Preserved prior FEATURE-001/002/003/004 changes/reports/migrations and the original dirty worktree. Added real HTTP SDK tests, a public SDK sample, deterministic queryable publication and recovery, actual same-event Query/BFF/browser acceptance and narrow Log Explorer compatibility fixes. The implementation report lists exact source areas and compatibility decisions.

## 5–10. Actual execution chain

Managed credential issued through canonical Admin service → public SDK sample → actual Gateway authentication/admission → synchronous-fsync WAL → deterministic finalized JSONL/manifest/catalog → actual Prisma/DuckDB Query Service → signed-OIDC authenticated/CSRF BFF → existing Angular Log Explorer. No independent fixture query is used as proof of this chain.

The archive publisher derives tenant identity from the authenticated WAL header; Query already requires that field for row isolation. Direct Log Explorer navigation now loads the real session/workspace; cursor pages retain their original relative time bounds. Search uses the installed Platform button API. The Query/BFF authorization system is retained.

## 11–14. Continuity, isolation, recovery and measurements

Primary scope: 30 initial + five recovery SDK events. Exact 35 IDs and canonical fields match across WAL, actual finalized archive, Query, BFF and two browser pages. Five additional actual SDK events populate a foreign tenant; authorized Query returns them and forbidden Query/BFF scope requests are rejected. No missing primary IDs, unexpected duplicates or field mismatches. The sanitized acceptance manifest and E2E report identify the run and measurements.

Real lost Gateway acknowledgement retries one unchanged SDK batch with no extra WAL append. A real isolated catalog failure after durable acknowledgement recovers after worker/process restart. Partial trailing WAL bytes are safely truncated. Invalid timestamp/schema/oversized requests append nothing. Test credentials are revoked and next actual requests fail. Existing real-file corruption/fsync/process recovery regressions supplement this run; failure evidence levels and untested infrastructure failures are explicit in the security report.

Local performance has no arbitrary SLA: manifest records submission/observed throughput including intentional retry, event bytes, a separate real WAL fsync benchmark, Query latency and drained queue state. No distributed exactly-once or production scalability guarantee.

Final measurements: initial 30-event SDK submission **510.32 ms**, approximately **58.79 events/sec** including deliberate lost-response retry; **1,075.9 bytes/event** average. Separate real WAL fsync append benchmark **3.44 ms**. Initial archive catalog registration occurred **155 ms** after the first SDK event timestamp (includes upstream work). Query HTTP response **161.34 ms**. Observed Query visibility upper bound **2,754.82 ms** from final main catalog registration to completed query artifact, including service startup and assertions. SDK pending queue after flush: **0**. These are local observations, not isolated stage SLAs or peak-memory measurements.

## 15–16. Security and regression evidence

All test mutation targets are verified disposable stores/PostgreSQL 5433; runtime credentials stay private. No API role/security bypass, preview fallback, token disclosure or new IAM/credential subsystem. No unresolved identified P0/P1 security or acknowledged-event-loss defect in the tested contract.

| Command | Result / leaf count |
|---|---|
| `pnpm --filter @skyra/logger-node build` | PASS |
| `pnpm --filter @skyra/ingestion-gateway build` | PASS |
| `pnpm --filter @skyra/query-service build` | PASS |
| `pnpm --filter @skyra/console-web build` | PASS |
| `pnpm --filter @skyra/logger-node test` | 54 pass |
| `pnpm --filter @skyra/ingestion-gateway test` | 103 pass, one explicit no-isolated-env skip |
| `node scripts/run-isolated-compatibility.mjs` | 21 actual PostgreSQL tests pass, covering that isolated path |
| `node scripts/run-project-query-tests.mjs` | 210 pass; guarded actual disposable target |
| `pnpm --filter @skyra/console-bff test` | 99 leaf pass; Node total 100 includes parent |
| `pnpm --filter @skyra/admin-service test` | 94 pass |
| `pnpm --filter @skyra/console-web test` | 98 pass, including new fixed-window paging regression |
| `node --test tests/credentials/persistence.test.mjs` | 28 leaf pass; Node total 29 includes parent |
| `pnpm test:contracts` | 61 pass |
| `node --test tests/admin/isolated-target.test.mjs` | 15 pass |
| `node --test tests/credentials/feature005-pipeline.test.mjs` | One real-service integration leaf passes; multiple assertions are not separate business tests |
| `node scripts/run-pipeline-e2e.mjs` | 56 leaf pass when full: 38 prior Org/OIDC/Members/Projects + one same-event chain + 17 Credentials; Node total 57 includes parent |
| `pnpm governance:check` | PASS; Platform remains read-only |

Explicit console/Gateway typechecks and Git whitespace checks are recorded separately. Focused browser repeats are not added to independent coverage counts. Unit tests are not substituted for same-event E2E proof. Responsive/light-dark scans and screenshots are recorded, without claiming full WCAG certification.

All table commands exited 0. Final browser total is **57 passed / 0 failed / 0 skipped**, including the parent container; independent leaf count is **56**. All six scoped Explorer scans report zero violations. Desktop/mobile screenshots were inspected. Existing SDK, Gateway, Query, BFF, Admin, Console, credential persistence and protected-target suites pass; the generic Gateway suite's one explicit isolated-environment skip is covered by the separate 21-test real PostgreSQL run.

## 17–20. Preservation, limitations and final verdict

Protected PostgreSQL before/after snapshots are byte-for-byte unchanged: SHA-256 `90f73c6f2bc6bce568974e27472fd652505e3034284ff4a9883104b1fd02a6ff`. All seven isolated migration checksums match their staged SQL; Prisma mirrors are identical and unchanged from FEATURE-004. Runtime separation and restored archive INSERT privilege were checked. Thirty-seven immutable Platform archives match HEAD; Platform remains clean at `928ca4343ab3a1887e586123a6ba5bb88b56a0ef`.

Initial FEATURE-005 source snapshot: **186 folded Git entries**; continuation snapshot after inherited SDK draft: **189**. Final: **209 folded entries, 75 tracked modifications, 134 untracked entries, zero staged**. LogHub stays on `main` at `19f084ad36fe37bb57ca107103e136d2d4a378be`. Every pre-existing path remains; initially clean generated Angular cache was restored. Existing feature reports/migrations were not rewritten. No commit/push/reset/rebase/merge.

All harness services stopped. With zero other disposable client connections verified, the manifest-owned isolated PostgreSQL cluster started for this work was stopped, restoring its initial stopped state. Test data and evidence remain available. Protected PostgreSQL was not stopped or modified.

Limitations: local retained-WAL durability and deterministic batch publication, not replicated/distributed exactly once; memory buffering before admission is not durable; JSONL is the tested query path; no same-run Parquet claim; corruption/conflicting published bytes require intervention; production retention/power-loss/rotation combinations and scale are not certified. Publication is opt-in and protected activation remains deferred. Real Microsoft setup, hosting/deployment and FEATURE-006 are outside this work.

**PASS — FEATURE-005 IMPLEMENTED IN ISOLATION.** The required same-event SDK-to-browser path, recovery/security checks, regressions and protected-state preservation have passing evidence. This verdict does not activate the protected environment or certify production deployment.
