# FEATURE-004 — Real ingestion and browser acceptance

Date: 2026-11-05. Authoritative evidence: `.tmp/feature004-evidence/e2e.log`, `persistence.log`, `ingestion-acceptance.json`, `ingestion-store.json`, `revocation.json` and accessibility JSON/screenshots. These are ignored local acceptance artifacts; no secrets are included in this report.

## Actual tested chain

Controlled RS256/JWKS/code/S256 provider → actual BFF cookie session/CSRF → Angular → BFF credential proxy → Administration Service → PostgreSQL 17.9 → actual HTTP Ingestion Gateway → synchronous WAL fsync + PostgreSQL receipt → existing JSONL archive append.

The protocol fixture uses real signed tokens/code exchange; mock OIDC exchange is disabled. No actual Microsoft account or external tenant is involved. Disposable DB is `skyra_loghub_disposable_validation` on 5433; cluster `26d25080-7655-4147-b05a-512ad359e14f`. Manager and Gateway use separate verified nonowner roles. Fixture data contains two isolated tenants, canonical owner/admin/project-admin/developer/viewer identities, inactive/missing members and real ACTIVE/SUSPENDED/ARCHIVED projects. Issuer and loopback service ports are dynamically allocated and recorded in `e2e-environment.json`; no public configuration is invented.

`tests/credentials/gateway-stack.mjs` starts built `apps/ingestion-gateway/dist/main.js` with explicit isolated runtime URL and owned WAL/archive roots. Readiness must report connected PostgreSQL and ready durability, not merely return a test-mode HTTP 200. Store metadata is written before requests; restart verifies the same marker and paths. Only harness-owned processes are stopped. Existing receipt cache implementation is NullReceiptCache; no broker/cache service is substituted for admission.

## Credential journey and observations

1. Authenticate owner, open a real ACTIVE project, select it for workspace, and navigate using its Ingestion credentials button. Real persisted list supports pages/search and safe metadata.
2. Validate creation form, issue through Angular/BFF/Admin, verify masked handoff, reveal the actual 256-bit secret in memory, exercise clipboard copy and restore previous clipboard, acknowledge and reload. No raw token remains in metadata, browser DOM, local/session storage, URL/history or ordinary notifications.
3. Send an actual bearer-authenticated POST `/ingest/v1/logs`. Payload is based on `contracts/ingestion/v1/examples/valid-authoritative-batch-request.json`: protocol 1.0, UUID batch/event IDs, ECS 8.11.0, canonical schema 1.0, event/service/production environment and exact project attribution.
4. Observe HTTP 200 `durably_accepted`; inspect the matching PostgreSQL receipt, deserialize actual WAL frames with CRC32C and payload SHA-256 verification, and verify the expected message in the actual project/tenant frame and archive JSONL.
5. Replay the identical batch: no extra WAL frame. Change the same batch ID's content: 409. Restart the actual Gateway on its same owned store: matching duplicate still succeeds without another frame.
6. Create replacement in browser and acknowledge onto its distinct detail route. New secret differs; scope/rate and remaining expiry do not increase. Old and new secrets both ingest during explicit overlap.
7. Revoke old in browser: next real authentication returns 401. Replacement still ingests. Revoke replacement: its next authentication also returns 401. Elapsed post-response denial measurement is recorded in `revocation.json`; it is a local observation, not a latency SLA. No credential cache exists; already authenticated requests may finish.

Final successful run retains six CRC/digest-verified WAL frames and six matching tenant receipts. This proves acknowledged admission and restart/deduplication durability. JSONL append is also directly observed. Finalized/signed archive publication, query availability for these specific Gateway events, replication and distributed delivery are not asserted. The existing separate Query suite verifies its own real Node SDK → archive/manifest → Parquet → query HTTP pipeline.

## Negative and fault paths

Actual Gateway rejects missing, malformed, unknown, expired and explicitly revoked credentials. Wrong project/environment, inactive project and suspended tenant are denied without WAL append. Reactivation restores admission for a still-valid key and never revives a revoked one. Supported rate 60 test returns 429 with Retry-After without appending invalid/throttled batches; existing process-local rate-limit semantics are retained.

Additional `node --test tests/credentials/inactive-project-http.test.mjs`: one real HTTP leaf test passes for valid persisted credentials on both SUSPENDED and ARCHIVED projects, returning 403 and leaving zero WAL frames. It uses a separate marked store/evidence subdirectory and models keys issued before project deactivation.

Temporarily withdrawing only the isolated Gateway's verifier-read column permission produces safe retryable 503, no Prisma details/token in response and no WAL append. A finally block restores the exact permission and real ingestion recovers. The shared PostgreSQL server is not stopped. Unit error tests supplement this with thrown verification/tenant exceptions.

BFF tests require session, CSRF, server-resolved canonical role and actual project scope, and deny cross-tenant access. Direct ingestion bearer use against Admin is rejected. Create retry with the same UUID cannot return/recreate a secret; stale/missing version is rejected. Browser drops a real successful creation response, shows safe review, finds exactly one metadata row by request UUID and revokes the unconfigured key. Credential metadata service failure/retry and delayed loading use actual UI states.

## Browser, accessibility and regressions

Combined browser result: **55 leaf scenarios passed, zero failed/skipped** (Node totals 56 include one parent). Breakdown: 18 Organization/signed-OIDC/security, 9 Members, 11 Projects, 17 Credentials/Gateway. Browser fatalConsoleErrors is empty. Persistence: **28 leaf checks passed** (29 including parent), including actual database concurrency and audit rollback; unit suites are not counted as real E2E proof.

Scoped Axe scans cover credential list at 1440 light, 768 dark and 390 light; creation form; labelled rotation confirmation and masked handoff; revocation confirmations are scanned before committing. Dialog Tab focus stays within the composed native dialog and Escape cancels without mutation. Screenshot inspection checks desktop/mobile layout and masked handoff; responsive table overflow stays in its panel. These are scoped checks, not full WCAG certification.

Safe screenshots: `credentials-desktop-light.png`, `credentials-tablet-dark.png`, `credentials-mobile-light.png`, `credentials-create-form.png`, `credentials-masked-handoff.png`, `credentials-replacement-confirmation.png`, `credentials-revoke-confirmation.png`. No revealed-secret screenshots, tracing, HAR or video. Failed-run screenshots are scrubbed before capture; the final e2e.log is authoritative for acceptance.

## Reproduce safely

Prerequisite: existing independently verified isolated cluster/private state and prior FEATURE-001/002/003 migration rehearsal stage. Do not point these scripts at a protected URL or initialize/reset another database.

```powershell
node scripts/isolated-postgres.mjs start
pnpm --filter @skyra/admin-service build
pnpm --filter @skyra/console-bff build
pnpm --filter @skyra/ingestion-gateway build
pnpm --filter @skyra/console-web build
pnpm --filter @skyra/console-bff test # compiles the controlled provider helper too
pnpm db:isolated:credentials
pnpm test:credentials:persistence
pnpm test:credentials:e2e
```

Preparation verifies target/physical identity, immutable ledger/catalog and runtime state, repeats Prisma/grants checks and creates fresh isolated fixtures. Runner starts only local services with explicit disposable settings. All protected snapshot work is a separate read-only path. See final acceptance for complete regression commands/counts and protected-state evidence.
