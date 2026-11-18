# FEATURE-004 — Final acceptance

Date: 2026-11-05. Verdict: **PASS — FEATURE-004 IMPLEMENTED IN ISOLATION**. Protected activation remains deferred.

## 1. Executive result

Complete credential lifecycle through actual Angular, BFF, Admin, PostgreSQL and Gateway: create → masked one-time reveal/copy → real durable ingestion → overlapping replacement → explicit old/replacement revocation → real HTTP rejection. No identified unresolved P0/P1 defect. Evidence and limits are detailed in the implementation, database security and ingestion E2E companion reports.

## 2. Initial Git state

LogHub `main`, HEAD `19f084ad36fe37bb57ca107103e136d2d4a378be`: 164 folded porcelain entries, zero staged, 60 tracked modifications and 104 untracked entries. Existing FEATURE-001/002/003 work/reports were preserved. Platform `main`, HEAD `928ca4343ab3a1887e586123a6ba5bb88b56a0ef`: clean, read-only. Initial status captured in `.tmp/feature004-evidence/initial-status.txt`.

## 3–5. Reused architecture, credential model and crypto

Existing canonical ingestion_credentials, Gateway authentication/project admission, role/capability resolver, trusted BFF assertions, audit repository and WAL/receipt/archive pipeline. No duplicate credential or IAM subsystem. New secrets are 32 CSPRNG bytes, `skyra_live_` + 64 hex, SHA-256 verifier only, indexed lookup and constant-time returned-digest comparison. Constant public prefix exposes no random bits; UUID identifies the key. No secret retrieval/decryption/cache path. Safe metadata includes project, creator, expiry/status, request/replacement IDs, version and permitted actions. Best-effort last-used is not presented as reliable ingestion telemetry.

## 6–8. Migration, Admin and BFF

Immutable additive FEATURE-004-001 SQL and separate FEATURE-004-002 grants; schema ledger has seven migrations. Composite tenant/project/replacement FKs, unique request/replacement constraints, terminal immutable-scope trigger and listing index. Validate/generate/repeat deploy/checksum/catalog/rollback/drift tests pass. Canonical/Query Prisma mirror matches. Manager cannot read verifiers; separate Gateway nonowner can authenticate but cannot issue/revoke/admin-audit.

Admin `/admin/v1/tenants/:tenantId/projects/:projectId/credentials`: list/detail GET, create POST, `/:id/rotate` POST and `/:id/revoke` POST. BFF same suffixes under `/bff/projects/:projectId/credentials`, deriving tenant from session. Strict DTO/filter validation, safe metadata projection, no-store headers, short-lived operation assertion, CSRF/Origin, UUID issuance idempotency and If-Match. API schemas/OpenAPI document implemented routes; historical unscoped proposals remain explicitly labelled unimplemented.

## 9–10. Angular and Platform

Actual HttpClient list/create/detail/replacement/revoke, server capability actions, pagination/search/filter/sort, validation/empty/loading/error/retry/conflict and ambiguous-issuance review. One-time secret masked by default, explicit reveal/copy/acknowledgement and cleanup on leave/destroy/pagehide; no URL/storage/log persistence. Guarded routes and project detail navigation. Reuses installed Platform components/tokens; no shared primitive copies, new packages or archive modifications. Governance passes; scoped responsive/theme/form/dialog checks and safe screenshot inspection are recorded in E2E report.

## 11–12. Gateway and lifecycle

Actual nonowner Gateway on fresh marked local stores accepts browser-issued bearer token; six verified WAL frames/receipts and actual JSONL append, including duplicate/restart checks. Existing query regression separately passes its own SDK/archive/Parquet/HTTP path; query visibility of the six credential-test events is not claimed.

Replacement inherits exact scope/rate and no more than remaining source expiry; one child per source. Old key remains valid until explicitly revoked or expired. Revoke is permanent and idempotent, with one audit. No credential cache: authentication started after committed revoke is denied immediately; previously authenticated/in-flight work can finish. Actual post-response denial elapsed observation is in revocation.json, not a general latency guarantee. Expired/invalid/missing keys and inaccessible project/environment/status are denied.

## 13–14. Authorization, audit and concurrency

Canonical permissions unchanged: OrgOwner/OrgAdmin and correctly scoped ProjectAdmin read/create/rotate/revoke; Developer read/rotate only; Viewer none. Persisted active identity/tenant/member/project scope governs every request, never provider/browser role claims. Cross-tenant/scope and ingestion-token Admin attempts fail. No real identity/customer bootstrap.

Existing IAM/project locks and source credential locks serialize changes. Create/rotate/revoke plus safe canonical CREDENTIAL_CREATED/ROTATED/REVOKED audit share a transaction; injected audit failure rolls each back. Real concurrent creates/rotations/revokes and rotation-vs-revoke tested. No raw secret/verifier in audit, safe responses, application logs or durable events.

## 15. Exact verification

Environment: Windows/PowerShell; Node 24.14.0, pnpm 12.3.4, Angular core 19.2.25 / CLI 19.2.27, Prisma 5.22.0, PostgreSQL 17.9. All commands below exited 0. Logs are under `.tmp/feature004-evidence/`.

| Command | Passed leaf tests | Notes |
|---|---:|---|
| `pnpm --filter @skyra/admin-service test` | 94 | IAM/authorization/audit/API regressions |
| `pnpm --filter @skyra/console-bff test` | 99 | Node total 100 includes one parent; signed OIDC/session/CSRF and new projection tests |
| `pnpm --filter @skyra/ingestion-gateway test` | 103 | One explicit no-isolated-env skip; separately exercised below |
| `node scripts/run-isolated-compatibility.mjs` | 21 | Actual guarded PostgreSQL production repositories; zero skipped |
| `pnpm --filter @skyra/console-web test` | 97 | Console regressions |
| `pnpm test:contracts` | 61 | Includes managed credential schemas |
| `node --test tests/credentials/persistence.test.mjs` | 28 | Node total 29 includes parent; real nonowner persistence/crypto/scope/race/rollback/drift |
| `node scripts/run-credentials-e2e.mjs` | 55 | Node total 56 includes parent; 18 Org/OIDC + 9 Members + 11 Projects + 17 Credentials/Gateway |
| `node --test tests/credentials/inactive-project-http.test.mjs` | 1 | Actual HTTP rejection for valid persisted keys on SUSPENDED and ARCHIVED projects; zero WAL frames |
| `pnpm --filter @skyra/query-service exec tsc -p tsconfig.test.json`; `node scripts/run-project-query-tests.mjs` | 210 | Guarded compatibility incl. existing SDK→archive→Parquet→query and live read-only PostgreSQL; zero skipped |
| `node --test tests/admin/isolated-target.test.mjs` | 15 | Protected/wrong-target rejection |

Admin/BFF/Gateway/Angular builds pass; Admin/BFF/Angular explicit typechecks pass. `node scripts/prepare-credential-tests.mjs` passes guarded schema validation/client generation, repeated migration deploy/grants and integrity checks. `pnpm governance:check` and `git diff --check` pass. Both OpenAPI YAML documents, four implemented path references and three managed schemas parse successfully. Scoped credential Axe scans report zero violations; prior feature accessibility/browser regressions pass. Parent containers are excluded above; unit tests are not counted as real E2E proof.

## 16. Protected database

Separate before/after READ ONLY snapshots verify `5432/skyra_loghub_dev/skyra_loghub_user`. Same SHA-256 `90f73c6f2bc6bce568974e27472fd652505e3034284ff4a9883104b1fd02a6ff`; same catalog, eight tables, one baseline migration, zero application rows. No protected migration, grant, credential, audit or bootstrap write.

## 17. Limitations / pending activation

Real Entra tenant/app registration/login and verified initial organization/owner remain pending external configuration/human decisions. Protected migration/runtime activation still requires explicit review/approval. Legacy wildcard/multi-project credentials remain unmanaged; their entropy is not upgraded from digest shape. No claim of distributed durability, finalized archive/query visibility for these Gateway events, retroactive cancellation, global rate limiting or reliable ingestion usage metering. Clipboard/network tools belong to the authorized recipient. No full WCAG certification from scoped scans.

## 18–19. Final state and verdict

Final Git: **186 folded entries; zero staged; 62 tracked modifications; 124 untracked entries**, including prior work. HEAD/branch unchanged. `.tmp/feature004-evidence/final-audit.json` verifies every pre-existing path remains, all seven migration ledger checksums match their staged SQL artifacts, matching Prisma mirrors, safe runtime flags/grants, 37 package archives matching HEAD, and unchanged protected snapshot. Generated Angular cache was restored only where initially clean. Platform remains clean at its original HEAD. All harness services stopped; the manifest-owned disposable PostgreSQL cluster started for this task was stopped, restoring its initial stopped state. Data/evidence remain available for review.

No staging, commit, push, reset, rebase, merge, deployment, Microsoft account modification or FEATURE-005 work. All pre-existing feature work is preserved.

**PASS — FEATURE-004 IMPLEMENTED IN ISOLATION.** Production/protected activation is not included in this verdict.
