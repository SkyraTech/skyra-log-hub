# SKYRA LOGHUB — DEV-018 Final Acceptance

## 1. Executive summary

The current implementation passed the fresh integrated development matrix and P1-001’s overwrite path is fixed. Unconditional acceptance remains blocked because the four original historical bytes cannot be recovered from accessible sources.

## 2. Acceptance verdict

**FAIL — DEV-018 preservation evidence unrecoverable.** The isolated runtime, code, and prevention checks passed; four pre-existing evidence files still do not match the DEV-018-start manifest and no authentic copies were found.

## 3. Initial source state

Git HEAD `19f084ad36fe37bb57ca107103e136d2d4a378be`, branch `main`, zero staged changes, 1,491 inventoried paths. Existing dirty worktree was preserved.

## 4. Platform state

The sibling Platform repository remained clean at `928ca4343ab3a1887e586123a6ba5bb88b56a0ef`; all 37 packaged archives were unchanged.

## 5. Protected database state

The protected target was read-only at `127.0.0.1:5432/skyra_loghub_dev`. Before/after catalog snapshots are identical; no protected write was performed.

## 6. Disposable environment

All dynamic validation used the manifest-owned disposable PostgreSQL cluster on port 5433. It was stopped at the end of the run.

## 7. Service topology

Angular Console, BFF, Admin, Gateway, Query, WAL/archive, disposable PostgreSQL, controlled signed OIDC, and packaged SDK consumers were exercised as real local processes.

## 8. Authentication

Signed test OIDC, issuer/audience/signature checks, CSRF, HttpOnly sessions, restart recovery, expiry, and revocation passed. Real Entra remains unconfigured.

## 9. Organization and members

Current Admin mutations and role-scoped member/organization flows passed through the integrated browser suite.

## 10. Projects

The master project was created and updated through the real Admin/BFF path; project audit IDs reconciled exactly.

## 11. Ingestion credentials

Managed credential creation, validation, revocation, foreign scope, and secret redaction passed.

## 12. SDK and ingestion

Fresh Node 24 and Node 22 packaged SDK consumers emitted canonical events, including lost-ack retry behavior.

## 13. WAL and archive

WAL frames, archive JSONL, byte counts, retirement, and permanent receipts reconciled with the admission ledger.

## 14. Query and Explorer

Search, cursor binding, filters, JSON/CSV exports, Parquet-only reads, saved searches, deep links, and detail drawer identity passed.

## 15. Analytics

Current/previous periods, exact scope, refresh behavior, service/severity/environment filters, and Parquet parity passed.

## 16. Usage and quotas

Authoritative admission windows, pending/committed accounting, selected UTC day, and foreign-project controls passed.

## 17. Audit history

Actual administrative mutations created immutable records; actor enrichment, correlation, JSON/CSV export, pagination, and redaction passed.

## 18. Persistence and recovery

BFF restart, fresh signed sessions, durable preferences/searches/history, PostgreSQL/session recovery, and WAL replay passed.

## 19. Least privilege

Admin, Gateway, BFF, and archive-only Query runtime grants were directly inspected. Query denial tests passed 12/12.

## 20. Security validation

Cross-tenant/project, stale authority, forged context, CSRF, cursor, export, credential, and quota abuse cases were denied as expected.

## 21. Reliability validation

Lost acknowledgements, retries, outages, cancellation, deadlines, crash recovery, cleanup interruption, and retirement were exercised.

## 22. Browser validation

The final integrated browser run reported 92 tests, 92 passes, zero failures, and zero skips.

## 23. Accessibility and responsive validation

Responsive light/dark layouts, keyboard paths, reduced motion, and scoped Axe checks passed in the integrated suites.

## 24. SDK validation

Node 24/22 package builds, contracts, consumers, and Python tests (78/78) passed.

## 25. Performance observations

Bounded local read measurements are recorded in `read-measurements.json`; they are not production SLA claims.

## 26. Data reconciliation

The fresh master cohort contained 261 event IDs and 106 project audit records reconciled across all downstream views.

## 27. Defect status

P1-002, P2-001, and P2-002 are resolved. P1-001 is root-caused and overwrite-prevented but remains open/unrecoverable because four historical evidence hashes differ and no authentic recovery copies exist.

## 28. Production-readiness boundary

This report does not claim production readiness, real Entra activation, distributed exactly-once semantics, physical power-loss durability, hosting, backups, or capacity certification.

## 29. Activation prerequisites

Real Microsoft Entra setup, verified first organization/owner, protected bootstrap approvals, production secrets, monitoring, backups, retention, and npm publication remain pending.

## 30. Required follow-up

Recover the original four DEV-013 evidence files from an external backup, preserve the current mismatched copies separately, restore only exact hash matches, rerun `verify-prior-evidence.mjs`, rerun the final audit, and then reassess the verdict. Do not use regenerated evidence.

## 31. Final acceptance statement

The implementation is technically validated in isolation and future historical overwrites are prevented, but DEV-018 is not unconditionally accepted until the original four evidence bytes are recovered and the preservation exception is cleared.
