# FEATURE-008 — Final acceptance

## 1. Executive summary

PASS — FEATURE-008 IMPLEMENTED IN ISOLATION. Persisted technical event/byte quotas now span Gateway, SDK, Admin, BFF and Angular. No protected activation or deployment.

## 2. Initial Git/source state

LogHub main at 19f084ad36fe37bb57ca107103e136d2d4a378be: 271 folded entries, 118 tracked modifications, 153 untracked, zero staged. Captured initial-status.txt and initial-source.json before implementation. Existing work was retained.

## 3. Existing quota architecture reused

| Area | Existing | Missing before FEATURE-008 | Action |
|---|---|---|---|
| Quota model | ProjectQuota, tenant/project FK, batch/payload/per-second fields | Daily policy/version | Extend existing table; preserve legacy fields |
| Usage | Seven-day receipts and archive catalog | Authoritative window counters/permanent accounting | Add usage windows, admission ledger, journal registry |
| Gateway | Auth/rate/validation/ACTIVE checks, WAL fsync, receipts, archive publication | Shared daily enforcement and cross-resource recovery | Integrate reservation/finalization and owned reconciliation |
| Concurrency | In-process same-batch lock, exclusive WAL ownership | Cross-Gateway project budget serialization | Pinned PostgreSQL advisory lock |
| Admin | Persisted membership/capabilities, QUOTA_UPDATED audit type | Usage and daily policy implementations | Reuse authorization/audit; strict ETags and limits |
| BFF | Opaque sessions, CSRF, signed assertions, active tenant | Typed usage/policy proxy | Add no-store, scope-checked response projections |
| Angular | Project Settings, Platform shell/buttons/inputs/tokens | Real usage page/settings | Add project navigation and responsive usage composition |
| Tests | Actual SDK/WAL/PostgreSQL/OIDC/browser harnesses | Quota boundaries and crash windows | Extend harnesses; retain prior-feature regression evidence |

## 4. Metering contract

Accepted events are normalized event-array entries in a durably admitted batch. Canonical ingestion bytes are Buffer.byteLength(JSON.stringify(normalizedEvents), 'utf8'): array brackets and commas count, including UTF-8 Unicode bytes. The HTTP envelope, compression, WAL framing, archive enrichment/size and Query reads do not count. Changing batching can change bracket/comma overhead. Analytics and archive visibility are not the accounting authority.

Hard project budgets use UTC daily windows [00:00:00, next 00:00:00). The server admission clock selects the window; event timestamps and browser dates cannot select it. A reservation remains in its original window across midnight. No reset cron runs. Null event/byte limits are unlimited; a missing row is enabled/unlimited; disabled policies still meter usage. Zero blocks new nonempty batches. The whole batch must fit both limits. Remaining capacity is max(0, limit - accepted - reserved); percentages include reservations and clamp to 100, including zero limits. Reductions never rewrite usage. Policy edits serialize with admission, affect new reservations, and require the current ETag. API counters/limits are decimal strings bounded at 9007199254740991.

## 5. PostgreSQL schema/migrations

Extended ProjectQuota; added tenant/project/day counters, permanent admission identity and owned-journal registry. Additive lock-only authority avoids Gateway metadata UPDATE. Nine isolated ledger entries, old seven checksums preserved; rollback, repeat deploy, catalog drift, grants, Prisma validate/generate and byte-identical mirrors pass.

| Migration | SHA-256 |
|---|---|
| 20261106000000_feature008_quotas | beb67300844a31a2d315b4a835b19f9ed9a22dba65ee72f7716515a5e365a897 |
| 20261106010000_feature008_lock_authority | 19573408090c2f01a7e23221640801bb928cc253c1ddc29c437ec5f98e499ca6 |

## 6. Gateway enforcement

Existing auth/rate/strict validation/ACTIVE checks precede metered admission. PostgreSQL project locking protects exact event/byte reservations across processes/credentials. Duplicate ledger identity bypasses new quota charging. Whole-batch 429 PROJECT_QUOTA_EXCEEDED is distinct from rate, validation and storage errors. Accounting health is part of readiness.

## 7. WAL/accounting consistency

1. Existing authentication/rate guard, strict validation and whole-batch tenant/project/environment authorization run first. Metered batches must contain one project. Credential rate limiting remains before idempotency, so a throttled retry can receive the separate retryable rate error without a quota charge.
2. A pinned pg PoolClient acquires a session advisory lock keyed by tenant/project. Separate processes and credentials share this lock. Admin edits take the matching transaction advisory lock before project row locks.
3. Resolve permanent batch identity and digest before budget admission. COMMITTED returns the persisted receipt without append or charge; mismatched content is 409. Another journal's pending reservation is 503 until its owner recovers.
4. In a short transaction, verify ACTIVE tenant/project through a fixed-search-path lock-only function, check policy and counters, reserve exact events/bytes and persist a stable receipt ID. Commit the reservation.
5. In a second transaction, reacquire ACTIVE row locks, append/fsync the existing WAL, then atomically move reserved capacity to accepted counters and mark the ledger COMMITTED. The project advisory lock spans both transactions and the filesystem operation.
6. Fsync acceptance remains authoritative. If finalization fails after fsync, return durable acceptance, retain reserved capacity and reconcile; usage reads expose RECONCILING. Ambiguous append/fsync failures quarantine admission and return 503, retaining capacity.
7. On owned restart, validate every retained WAL segment, fsync verified frame-bearing files, reconcile exact matching pending frames once, and cancel reservations with no frame only after complete owned-journal recovery. Runtime reconciliation finalizes matching frames but never refunds missing frames by timeout. Reconciliation interruption rolls back; the next restart repeats safely.

## 8. SDK quota behavior

Hard exhaustion stops automatic retry with a safe explanatory flush error and retains a bounded stable batch. At most 8 KiB of an error body is inspected. No tokens/provider bodies enter diagnostics. Existing retry/timeout behavior passes all 55 SDK tests.

## 9. Admin API

GET usage, GET quota, PATCH quota under /admin/v1/tenants/:tenantId/projects/:projectId. Strict decimal/null limits, ETags including missing policy, current persisted permissions, and transactional immutable QUOTA_UPDATED audit. Failed audit insertion rolls the policy back. Optional UTC period reads do not change the meter.

## 10. BFF integration

SessionAuthGuard/CsrfGuard, HttpOnly opaque sessions, active server-selected tenant, short-lived signed internal assertions and authoritative Admin membership checks remain intact. No tenant override or role escalation; no-store responses project safe typed fields and hide ledger/receipt IDs.

## 11. Angular usage UI

Project navigation links to /projects/:projectId/usage. Exact accepted/reserved/remaining events and bytes, accessible progress, UTC period/reset, freshness/completeness, empty/unlimited/disabled/near-limit/exhausted states and error recovery. Owner edits have validation, explicit confirmation, cancel, conflict/reload and unsaved-change protection. In-flight loads are cancelled on replacement.

## 12. Skyra Platform compliance

Existing shell/buttons/inputs/spinner and design tokens reused; native labeled progress is a domain composition. No alternate UI library or Platform source copied. Governance passes; Platform clean at 928ca4343ab3a1887e586123a6ba5bb88b56a0ef; 37 immutable package archives match HEAD.

## 13. Quota authorization

Existing OrgOwner quotas.manage controls mutation. OrgAdmin and scoped ProjectAdmin/Developer have authorized reads only; Viewer cannot read quotas. Project scope, active membership, cross-tenant denial, CSRF, scope forgery, browser role tampering and safe response projection are tested.

## 14. Event/byte reconciliation

Two tenants, three projects: 15 actual SDK events and 5367 / 5372 / 5377 per-project canonical bytes reconcile exactly to WAL and PostgreSQL. Browser SDK consumption shows 10 events / 10894 bytes. Invalid/quota-rejected attempts add zero accepted usage; 12 concurrent duplicates charge once; permanent identity survives short-lived receipt deletion.

## 15. Concurrency/recovery

Two Gateway processes/two credentials submit 24 requests to a ten-event budget: ten accepted, fourteen rejected, overshoot zero. Exact-byte, one-byte-over, crossing-batch, UTC rollover, limit reduction and overflow gates pass. Actual process terminations, database errors, WAL ambiguity and reconciliation interruption recover without double charge.

## 16. Browser/accessibility

Full quota/OIDC run: 25 leaf tests. Additional scoped-role/near-limit/timing run: two leaves. Six responsive light/dark quota scans have zero violations. All six viewport/theme screenshots and exhaustion/near-limit screenshots retained; mobile dark view inspected. Existing Analytics/Explorer browser regressions and their scoped scans pass.

## 17. Regression test results

| Verification | TAP tests | Leaf tests | Result |
|---|---:|---:|---|
| Quota accounting, real PostgreSQL/Gateway/SDK and crash tests | 17 | 16 | PASS |
| Two-tenant SDK continuity, duplicates and boundaries | 5 | 4 | PASS |
| Full OIDC organization + quota browser suite | 26 | 25 | PASS |
| Additional scoped-role/near-limit browser checks and timing | 3 | 2 | PASS |
| Prior-feature full browser regression | 80 | 79 | PASS |
| Prior actual SDK/pipeline regression | 1 | 1 | PASS |
| Gateway, including live PostgreSQL/WAL/security | 124 | 124 | PASS |
| Admin Service | 94 | 94 | PASS |
| SDK (final code) | 55 | 55 | PASS |
| Contracts | 63 | 63 | PASS |
| Target guards | 15 | 15 | PASS |
| BFF (final, including quota projections) | 110 | 109 | PASS |
| Angular Console | 101 | 101 | PASS |
| Query Service | 214 | 214 | PASS |
| Credential persistence | 29 | 28 | PASS |

All final runs have zero failed, cancelled or skipped tests. Parent containers are excluded from leaf counts; overlapping organization scenarios across browser runs are not summed as unique tests. Builds/typechecks, Prisma validate/generate, repeat deploy, rollback/drift checks, governance, schema sync and git diff --check also pass.

Windows 10.0.26200, Node v24.14.0, PostgreSQL 17.9 on disposable port 5433, 12 logical CPUs, loopback HTTP. Two warmup and 20 measured five-event SDK batches per mode; phase metrics include warmups (22 samples).

| Local metric | Median ms |
|---|---:|
| Baseline SDK batch round trip, separate unmetered benchmark project | 17.45 |
| Metered SDK batch round trip | 33.71 |
| Observed round-trip difference | 16.26 |
| Reservation | 3.89 |
| WAL append/fsync | 1.02 |
| Counter finalization before commit | 0.99 |
| Entire accounting admission | 7.02 |
| Direct authoritative Admin usage read (12) | 7.34 |
| BFF usage read (12) | 12.43 |
| Angular refresh (5) | 56.24 |

The controlled 100-event metered run took 748.50 ms (133.60 observed events/s). Restart, reconciliation and Nest readiness after an injected durable-WAL crash took 1290.95 ms. These small sequential measurements include local instrumentation and do not establish production throughput, horizontal scale or SLAs.

## 18. Protected database preservation

Forced READ ONLY before/after snapshots are byte-identical: 90f73c6f2bc6bce568974e27472fd652505e3034284ff4a9883104b1fd02a6ff. Protected target remains 127.0.0.1:5432/skyra_loghub_dev as skyra_loghub_user, eight tables, one baseline ledger entry, zero application rows. No protected mutation, activation, grant, audit or bootstrap was performed. Isolated test triggers/privileges are restored and no app clients remain.

## 19. Remaining limitations

- Development acceptance only. Protected activation, deployment, real Entra setup and FEATURE-009 were not performed.
- Activation is explicit and coordinated: all ingesting Gateways need INGESTION_QUOTAS_ENABLED=true; Admin HTTP quota APIs require QUOTA_USAGE_ENABLED=true plus persisted auth configuration. Defaults remain off. Mixed metered/unmetered Gateway rollout is unsupported; operators must coordinate cutover. Existing unmetered history is not inferred from archives. First activation requires empty owned WAL stores.
- Lost journals require operator recovery; pending capacity is not blindly refunded by TTL. A no-frame reservation after a failed second transaction is released by verified owned restart. Original receipt ID/count/digest/window remain stable; recovery reconstructs segment/offset and committed_at from recovered evidence, with committed_at representing recovery time when finalization never persisted.
- Metered automatic compaction is disabled to preserve pending evidence; WAL and permanent admission ledger retention need explicit accounting-aware maintenance before production volume. Recovery/publication still scan retained journals; this local milestone does not establish production scale.
- Daily quotas are distributed through PostgreSQL. The inherited credential rate limiter and maxEventsPerSec metadata are separate and are not presented as a new distributed rate engine. Servers require a consistent UTC clock.
- Usage history is window-keyed; displayed policy is current policy, not historical plan pricing. No billing, plans, adjustments UI, destructive reset or new analytics store was added.
- Fault tests terminate processes and exercise actual fsync/PostgreSQL failures; they do not simulate physical power loss. Scoped Axe checks are not full WCAG certification. Local timings are not SLAs.

## 20. Final Git/source state

LogHub remains main at 19f084ad36fe37bb57ca107103e136d2d4a378be, zero staged; final folded status is 298 entries: 123 tracked modifications and 175 untracked entries, including the four new reports. This task changes 27 existing implementation/config/test files and adds 26 implementation/test files plus four reports. There was no reset, rebase, merge, commit or push. All initial files remain; 174 historical artifacts are byte-preserved. Platform stays clean. Prisma mirror SHA-256: edd8be3008f32de0ec4fdb59590ea8a85ebe142ba3f2b35cdcacd3e2f3ecda44. Whitespace checks pass. Generated TypeScript cache restored only after proving initial HEAD equality; the generated Angular lock is separately recorded. Final counts/hashes and exact file lists are in .tmp/feature008-evidence/final-audit.json. Owned services and disposable cluster are stopped after final verification.

## 21. Acceptance verdict

**PASS — FEATURE-008 IMPLEMENTED IN ISOLATION.** All required accounting, recovery, scope, API, UI, browser and regression boundaries were exercised without an unresolved P0/P1 defect in the isolated configuration. Operational constraints above are explicit. Protected development activation remains a separate human-authorized task. Stop here; FEATURE-009 was not started.

Evidence: .tmp/feature008-evidence (final quota/audit logs and JSON); .tmp/feature008-regression-evidence (fresh prior-feature browser/SDK cohorts). Reproduction commands are in SKYRA_LOGHUB_FEATURE_008_E2E_REPORT.md.
