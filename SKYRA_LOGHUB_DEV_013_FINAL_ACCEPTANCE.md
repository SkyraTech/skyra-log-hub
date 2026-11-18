# SKYRA LOGHUB DEV-013 — Final Acceptance

All evidence paths below are repository-relative under .tmp/dev013-evidence/. This is local run evidence from 2026-11-11, not production verification.

## 1. Executive summary

PASS — DEV-013 IMPLEMENTED IN ISOLATION. Durable sessions, restart recovery, revocation, expiry, rotation, cross-process enforcement and real Angular verification passed. No unresolved P0/P1 defect was identified in the tested scope.

## 2. Initial Git/source state

Branch main; HEAD 19f084ad36fe37bb57ca107103e136d2d4a378be. Initial folded status: 362 entries, 137 tracked modified, 225 untracked, zero staged. Work began on an already modified tree; existing work was preserved. Evidence: initial-source.json and initial-status.txt.

## 3. Previous session architecture

Normal BFF operation uses PostgreSQL with no in-memory fallback. The previous per-process session and pending OIDC maps could not survive restart or synchronize revocation. Explicitly isolated unit tests retain a gated memory adapter. Session tokens have 256 bits of randomness; only SHA-256 digests are persisted. AES-256-GCM encrypts minimal identity, CSRF and selected context with digest-bound authenticated data; no provider access/refresh/ID tokens or cached membership/role authority are stored. Dedicated database configuration and a separate 32-byte data key are mandatory. Normal launchers remove owner database URLs.

## 4. Durable store design

Normal BFF operation uses PostgreSQL with no in-memory fallback. The previous per-process session and pending OIDC maps could not survive restart or synchronize revocation. Explicitly isolated unit tests retain a gated memory adapter. Session tokens have 256 bits of randomness; only SHA-256 digests are persisted. AES-256-GCM encrypts minimal identity, CSRF and selected context with digest-bound authenticated data; no provider access/refresh/ID tokens or cached membership/role authority are stored. Dedicated database configuration and a separate 32-byte data key are mandatory. Normal launchers remove owner database URLs.

## 5. Database schema/migrations

Additive docs/admin/migrations/DEV-013-001/migration.sql creates bff_sessions and bff_login_transactions with six indexes and eight checks. Ledger name: 20261110000000_dev013_sessions. SHA-256: a5005caa73ba15a153fb2b72901d4a87f537874e9a3cd3bf9fb249b1713a4e7a. Disposable ledger now contains 11 entries; all previous ten checksums are preserved. Both Prisma schemas append matching models, preserve their original byte prefixes and pass validation/generation. Preparation exercises transactional rollback, application and repeat no-op verification.

## 6. Session creation/retrieval

Insert-only creation prevents stale writes from reviving sessions. Reads check revocation, idle and absolute expiry against database time before decryption. Conditional activity updates cannot extend the absolute lifetime. Versioned context updates preserve identity. Rotation locks and revokes the old record and inserts the new token atomically, retaining the original absolute deadline; failure rolls back. The response cookie is emitted only after commit. Logout persists revocation. Two BFF processes share these authoritative decisions, with no positive session cache. A request already authorized before a concurrent revocation cannot be retroactively cancelled; subsequent validation rejects the old token.

## 7. BFF restart recovery

Unchanged active cookies recover identity, context and CSRF after graceful restart and crash, without extending absolute expiry. Logged-out, revoked, rotated and expired cookies remain rejected after restart. See http-security.log and persistence.log.

## 8. OIDC transaction reliability

Encrypted durable login transactions retain state, nonce, PKCE verifier, callback, issuer/client and browser binding. Atomic one-time consumption precedes token exchange. Transactions expire within ten minutes and active count is capped at 1000 under a global transaction lock. Signed controlled-provider tests verify restart before callback, state/binding/expiry rejection, concurrent one-exchange behavior and replay denial. Existing signature/JWKS, issuer, audience, nonce and PKCE checks remain intact. Failure after consumption requires restarting login; there is no unsafe callback replay.

## 9. Session rotation/logout

Insert-only creation prevents stale writes from reviving sessions. Reads check revocation, idle and absolute expiry against database time before decryption. Conditional activity updates cannot extend the absolute lifetime. Versioned context updates preserve identity. Rotation locks and revokes the old record and inserts the new token atomically, retaining the original absolute deadline; failure rolls back. The response cookie is emitted only after commit. Logout persists revocation. Two BFF processes share these authoritative decisions, with no positive session cache. A request already authorized before a concurrent revocation cannot be retroactively cancelled; subsequent validation rejects the old token. A child killed after rotation commit but before cookie delivery leaves the old token invalid; the user must sign in again.

## 10. CSRF/cookie security

Opaque HttpOnly cookies and existing Secure/localhost development policy are preserved. CSRF is required for authenticated mutation including rotation/logout; origin checks reject forbidden origins with 403. Rotation changes CSRF. Callback error instances redact query strings and correlation identifiers are bounded/encoded. Session verifiers, encryption keys, database credentials and raw provider tokens are absent from these reports.

## 11. Membership/tenant authorization

Every protected request resolves current Admin membership and project authority. Explicit invalid/empty membership revokes the observed session; transient Admin failure fails closed without revoking a potentially valid session. Disabling tenant/member, changing scope and foreign-context attempts remain authoritative after restart. Restoration of a membership does not revive its previously revoked cookie.

## 12. Cross-process behavior

Insert-only creation prevents stale writes from reviving sessions. Reads check revocation, idle and absolute expiry against database time before decryption. Conditional activity updates cannot extend the absolute lifetime. Versioned context updates preserve identity. Rotation locks and revokes the old record and inserts the new token atomically, retaining the original absolute deadline; failure rolls back. The response cookie is emitted only after commit. Logout persists revocation. Two BFF processes share these authoritative decisions, with no positive session cache. A request already authorized before a concurrent revocation cannot be retroactively cancelled; subsequent validation rejects the old token.

## 13. Cleanup and expiry

Cleanup deletes at most the configured bounded batch per table (validated 1..500; scheduled default 100 every 60 seconds), using SKIP LOCKED. Two table passes commit independently and are safely repeatable. An actual child process was killed after the session DELETE committed; the next pass completed remaining login cleanup while active records survived. Expiry enforcement does not depend on cleanup running.

## 14. Database outage/recovery

Actual disposable PostgreSQL stop/start produced sanitized 503 for lookup, creation, login and logout. No identity was fabricated and failed logout did not clear the valid cookie or pretend revocation succeeded. After recovery the original session identity, CSRF and absolute deadline remained consistent; expired or disabled-member sessions stayed invalid. Pool connection/query limits bound failures, readiness reports dependency failure, and there is no stale-authority fallback.

## 15. Angular compatibility

Angular retains the established cookie/CSRF flow. Direct-route hydration and refresh work after BFF crash. Temporary dependency errors expose Retry session without treating cached display state as authenticated authority; 401/419 clears auth. Auth epochs prevent late hydration from restoring state after logout. Logout hydrates current CSRF even on an unguarded unauthorized route and reports retryable backend failure. Signed-out labels and theme-compliant login messaging were corrected without redesign.

## 16. Security test results

36 independent new backend leaves passed: migration 5, persistence 15, HTTP security 11, outage recovery 4, cleanup recovery 1. Final failure/skip count is zero. Superseded failures were resolved and final runs passed: login-transaction expiry fixture/production insert now share one database timestamp; direct unauthorized-route logout now hydrates authoritative CSRF; inactive-member expectations now require login denial; Admin outage expectations require retry and fresh recovery; external font requests are blocked for hermetic browser tests; a real light-theme login-banner contrast defect was fixed with the theme text token. One quota fault-injection run exceeded its parent timeout; the unchanged rerun passed in 38 seconds, and the original timeout cause remains unestablished. Whitespace was corrected. Earlier failed logs remain retained; final summaries identify the accepted runs.

## 17. Browser E2E results

Real local Angular, Console BFF, Admin, Gateway and Query services exercised disposable PostgreSQL and the existing controlled signed OIDC provider. No Microsoft account was changed. New HTTP tests launch two BFF processes and kill/restart actual processes; browser tests use real product APIs. Final integrated browser run passed 28 independent scenarios (20 prior product/storage plus eight session scenarios); 84 accessibility scans reported zero violations across themes and responsive sizes. Restart screenshots: session-before-restart.png and session-after-restart.png. Evidence: session-browser.json, http-security.json, outage-recovery.json, cleanup-recovery.json, integrated-browser.log, accessibility.json, retired-parquet-browser.json. DEV-012 actual retention/Parquet continuity also passed. External Google font requests alone are blocked for repeatability.

## 18. Performance observations

Single-operation local PostgreSQL timings (milliseconds; SQL statement counts): create 34.089/1, lookup 1.912/1, activity 1.447/1, rotate 4.578/5, revoke 1.286/1, cleanup 2.701/2. Peak observed RSS was 66,314,240 bytes. CPU counters rounded to zero at measurement resolution, which is not evidence of zero CPU cost. These are synthetic observations, not load-test percentiles; see session-measurements.json.

## 19. Regression suite results

| Suite | Independent passing leaves |
|---|---:|
| migration-security | 5 |
| persistence | 15 |
| http-security | 11 |
| outage-recovery | 4 |
| cleanup-recovery | 1 |
| bff-regression | 115 |
| integrated-browser | 28 |
| quota-integration | 16 |
| quota-boundaries | 4 |
| quota-browser | 7 |
| credential-persistence | 28 |
| audit-persistence | 10 |
| postgres-hardening | 10 |
| developer-documentation | 4 |
| developer-sample | 8 |
| storage-lifecycle.test | 15 |
| storage-ownership.test | 4 |
| console-regression | 108 |
| ingestion-gateway-tests | 124 |
| admin-service-tests | 98 |
| sdk-node-tests | 55 |
| contract-tests | 66 |
| target-guards | 15 |
| query-regression | 214 |

Build, compile, schema sync, design governance, both Prisma validation/generation and storage database-restart checks also passed. Commands ran from the repository root unless a service runner selected its package directory. New security: node scripts/run-session-security.mjs (sequential actual PostgreSQL tests). Each underlying invocation is node --test --test-reporter=tap tests/sessions/{migration,persistence,http-security,outage-recovery,cleanup-recovery}.test.mjs. Integrated browser: set SKYRA_SESSION_E2E=true, then run node scripts/run-integrated-acceptance.mjs; it launches node --test --test-reporter=tap tests/organization/organization.e2e.mjs with integrated and signed-OIDC test flags. Use scripts/run-session-regressions.mjs for supplementary regressions; --after-quota resumes already verified quota checks. Exact argv and working directories for additional suites are retained in additional-regressions.json and session-security-summary.json; service results are in regressions.json. TAP parent containers and the storage-database-restart file wrapper are excluded from independent leaf totals.

## 20. Protected database preservation

Protected PostgreSQL snapshots before/after are byte-identical, SHA-256 90f73c6f2bc6bce568974e27472fd652505e3034284ff4a9883104b1fd02a6ff. Protected endpoint remained 127.0.0.1:5432; no protected writes, migrations or grants occurred. Physical/manifest target guards restricted writes to disposable PostgreSQL 17.9 at 127.0.0.1:5433, database skyra_loghub_disposable_validation. Final audit preserves all 1373 initial files, 201 historical report/migration/package artifacts and 37 immutable Platform archives; Platform stays clean at 928ca4343ab3a1887e586123a6ba5bb88b56a0ef. DEV-012 Gateway storage and Query runtime source is unchanged.

## 21. Remaining limitations

Real Entra tenant/app registration and Microsoft login remain pending external configuration. Protected environment migration, least-privilege role provisioning, independent encryption-key provisioning and coordinated BFF activation require separate authorized operations. All BFF instances must share issuer/client configuration and the data key. Key loss or incompatible key replacement invalidates encrypted sessions; no online multi-key rollover is implemented. Local synthetic measurements establish no production load/SLA or comparable in-memory baseline. No DEV-014, deployment, publication, real onboarding or Git commit/push was performed.

## 22. Final Git/source state

382 folded entries; 144 tracked modified; 238 untracked. Branch main and HEAD 19f084ad36fe37bb57ca107103e136d2d4a378be are unchanged. No files staged, no commit, branch or HEAD change. Final preservation details and changed/new file lists are in final-audit.json.

## 23. Final verdict

PASS — DEV-013 IMPLEMENTED IN ISOLATION. All required local acceptance checks passed; protected/production activation remains pending. The manifest-owned disposable database is stopped at completion. Stop after DEV-013.
