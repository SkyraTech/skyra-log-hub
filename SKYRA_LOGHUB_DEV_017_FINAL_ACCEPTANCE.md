# SKYRA LOGHUB — DEV-017 Final Acceptance

## 1. Executive summary

PASS — DEV-017 IMPLEMENTED IN ISOLATION. Authorized audit export, actor/correlation enrichment and authoritative historical Usage/Angular reporting implemented. Required isolated acceptance completed with no observed unresolved P0/P1.

## 2. Initial Git/source state

Baseline main at19f084ad36fe37bb57ca107103e136d2d4a378be; 450 folded status entries (166 tracked modified/284 untracked), zero staged. 1467 initial source paths inventoried before edits. Existing dirty worktree preserved.

## 3. Existing audit architecture

Reused immutable Admin audit storage/writer, transaction coupling, append-only enforcement, canonical audit.read, allowlisted projection and signed timestamp/UUID keyset pagination. Actual mutations generate acceptance records.

## 4. Existing Usage/accounting architecture

Reused server-selected UTC admission periods, durable reservation/finalization, permanent admission identities, indexed daily windows and existing quota authorization. No Query/archive/event-time counters used for Usage.

## 5. Audit export contracts

Authenticated CSRF POST /bff/organization/audit/export; matching applied filters; JSON/CSV. Limits1000 records/5MiB/10 pages/15s, one/session and two/BFF. Fixed filenames; explicit metadata/headers/truncated status. No browser tenant/cursor/limit overrides.

## 6. Audit filter/cursor correctness

Exact actor/action/resource/project/UTC/correlation filters bound to signed tenant/reader/page-size cursor. First-page watermark and stable microsecond timestamp DESC/UUID DESC order. Invalid/expired/cross-reader/changed-filter cursor denied. Watermark-bounded traversal, not a global snapshot.

## 7. Audit export redaction/security

Same allowlist, deep BFF public reconstruction, repeated current authorization, no arbitrary metadata/secrets. CSV formula controls/Unicode/newline/quote handling, JSON UTF-8 and safe filenames verified. Failed traversals discard attachments; deliberate limit truncation explicitly identified.

## 8. Actor enrichment

One tenant-membership scoped batch per page; optional current safe display name ≤80 characters. No private email/claims or foreign directory query. Immutable actor ID retained; missing/unsafe names fall back to ID/unavailable. Rename tests preserve ID.

## 9. Administrative correlation

Reuse existing safe details.correlationId with exact case-sensitive filter and signed cursor binding; displayed/exported. Separate from application-log correlation. Old records remain unmodified, without invented correlation backfills.

## 10. Historical daily Usage

Current authorized active project, strict start-inclusive/end-exclusive UTC dates,1–90 days ending no later than tomorrow. Decimal accepted/reserved events/normalized bytes from authoritative windows. Missing windows zero; outages error.7/30/90 presets and details tested.

## 11. Historical policy/utilization semantics

No historical quota policy snapshots/effective intervals exist. Historical limit, utilization and exceeded-day state explicitly null/unknown. Current-policy reference labeled nonhistorical, includes pending capacity, permits >100%, handles zero/unlimited denominators. No fabricated historical policies or unnecessary migration.

## 12. Quota reconciliation

Actual SDK daily accepted counts3/5/0/0/1/0/2 match WAL/ledger/windows, exact normalized UTF-8 bytes and event IDs. Lost-ack duplicate charges once; rejection adds no charge. Pending fsynced reservation shown separately and reconciled once after crash. Existing WAL retirement/ledger/session regressions pass.

## 13. Angular Audit History enhancements

Correlation input, safe actor labels, applied filter context, JSON/CSV download status, cancellation, explicit limits/truncation, permission/error/empty states. Keyboard JSON export verified. BFF-only HttpOnly session/CSRF transport.

## 14. Angular Usage enhancements

Existing cards/quota controls retained; daily accepted events/bytes, current-reference charts, table and selected-day details. Pending/unknown states explicit. Project change cancels stale request; denied project clears old history. Keyboard, back/forward, direct refresh and themes verified.

## 15. Real administrative E2E

Actual organization/member/project/credential/quota/shared-search mutations,106 project audit records; two-page JSON/CSV exact-ID reconciliation and Angular downloads. Separate fault cohort101 actual updates. Immutability and audit-write rollback verified.

## 16. Real SDK historical-Usage E2E

Fresh official local package consumer, managed credential, actual Gateway/WAL/admission windows/Admin/durable BFF/Angular. Controlled test-only admission clock spans7 UTC days; actual event timestamps differ. Foreign tenant/project SDK cohorts excluded; independent daily manifest preserved.

## 17. Security/authorization matrix

15 real-service security/fault scenarios pass: no/expired session, CSRF/overrides, role matrix, actor privacy, mid-export revocation/downgrade, concurrency/disconnect/deadline/crash, write denial, inactive/suspended Usage, concurrent reads and DB recovery.31 contract leaves each on Node24/22; exact matrix in Security report.

## 18. Failure and recovery tests

Failed exports create no partial file; deliberate bounds truncate explicitly. Actual disconnect, BFF crash, upstream timeout,15s authority deadline and PostgreSQL restart recover safely. Pending WAL recovery preserves one charge. Superseded cancelled/configuration failures retained and distinguished from final passing logs.

## 19. Performance/resource observations

Final real audit export: 106 records across 2 pages, 80961 bytes compact JSON / 65141 bytes CSV. Successful export HTTP median 88.0ms (two format executions). Usage history HTTP median 36.5ms, maximum 125.6ms; largest measured history response 41188 bytes. Real 101-record/two-page export sampled BFF RSS peak 108.0MiB, heap 27.5MiB at50ms intervals. Full DEV017 browser-window BFF RSS max 143.0MiB, heap 51.8MiB at100ms intervals. The 7/30/90-day service reads used 12 Prisma operations each, including current authorization and excluding BEGIN/COMMIT protocol. One batched actor enrichment lookup for a100-record page. Local small-cohort observations only; sampled maxima are not absolute peaks or production capacity.

## 20. Accessibility/responsiveness

Both screens at1440/768/390 in actual computed light/dark themes:12 scoped Axe scans, zero violations/no page overflow. Keyboard export/day selection, focused controls, reduced motion and screenshots reviewed. Internal table scroll preserves mobile width. No WCAG certification claim.

## 21. Regression results

82 combined independent browser leaves plus final focused14; relevant audit/quota/storage/SDK/session/search/export/Analytics/developer/service regressions pass. Twelve typechecks, optimized Console build, Prisma validate/generate both mirrors, canonical schema sync, public JSON schemas, OpenAPI parsing, Platform governance and whitespace pass. Per-suite counts/commands in E2E report and test-counts.json; parent containers excluded.

## 22. Protected PostgreSQL preservation

All 1467 initially inventoried source paths remain present. 220 historical reports/migration/package artifacts match their baseline hashes; all 37 immutable Platform archives are unchanged. Platform remains clean at 928ca4343ab3a1887e586123a6ba5bb88b56a0ef. Both Prisma schema files match their initial bytes and each other. All 13 migration identities/checksums remain unchanged. Prior Gateway storage/accounting, Query/Analytics authority, SDK/core/Python source and canonical wire contracts are preserved. Protected forced read-only snapshots match: SHA256 90f73c6f2bc6bce568974e27472fd652505e3034284ff4a9883104b1fd02a6ff. No protected writes or activation. Zero final disposable application clients. Only the manifest-owned disposable cluster is stopped after final audit.

## 23. Remaining limitations

Historical quota limits, utilization and exceeded-day states are unknown because effective policies were not snapshotted; current-policy references are explicitly nonhistorical and include pending reservations. Audit export is a watermark-bounded keyset traversal, not a shared MVCC snapshot: late commits/backdated inserts may affect later traversal; actor names are mutable current permitted labels. Small local fixtures and two-export concurrency checks are not production capacity qualification. Automated Axe checks and screenshot review are not WCAG certification. Real Entra setup, verified first organization/owner and protected activation remain pending external/human prerequisites. No production deployment, package publication, billing/alerts or DEV-018 work.

## 24. Final Git/source state

HEAD/branch unchanged. Final folded status 464 (166 tracked modified/298 untracked), zero staged; 45 initially inventoried paths changed and 24 new paths added. Exact inventory in final-audit.json and Implementation report. No destructive Git operations or Platform edits.

## 25. Final verdict

PASS — DEV-017 IMPLEMENTED IN ISOLATION. Stop at DEV-017. No production/protected activation or DEV-018 started.

## Evidence index

[Implementation](SKYRA_LOGHUB_DEV_017_IMPLEMENTATION_REPORT.md), [Security and integrity](SKYRA_LOGHUB_DEV_017_SECURITY_INTEGRITY.md), [E2E and regressions](SKYRA_LOGHUB_DEV_017_E2E_REPORT.md), [contract](docs/administration/DEV-017-contract.md), [final-audit.json](.tmp/dev017-evidence/final-audit.json), [test-counts.json](.tmp/dev017-evidence/test-counts.json), [performance.json](.tmp/dev017-evidence/performance.json).
