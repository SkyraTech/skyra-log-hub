# SKYRA LOGHUB — DEV-018 End-to-End Report

## Execution summary

`integrated-browser-success.log` reports 92 tests and 92 passes, zero failures, zero skips. The run used current source and real disposable services rather than historical PASS text.

## Nine master scenarios

1. Real project administration, quota, shared/private searches, and preferences.
2. Fresh Node 24/22 SDK admissions across UTC periods, lost-ack identity, and foreign controls.
3. SDK IDs and canonical fields reconciled across WAL, JSONL, and admission ledger bytes.
4. JSONL search, three-page JSON/CSV exports, and current/previous Analytics exact scope.
5. Parquet-only Query and Analytics with unchanged canonical corpus.
6. Angular Explorer saved preset, Analytics refresh, and historical Usage day.
7. Administrative audit IDs, two-page JSON/CSV export, and separate correlation domain.
8. Preferences/search/history after BFF crash and fresh signed sessions with foreign denial.
9. WAL retirement with Query/history intact and replay returning the permanent receipt.

## Reconciliation facts

The master cohort contained 261 event IDs and 106 project audit records. WAL, JSONL, Parquet, Query, exports, Analytics, Usage, and Audit were compared using the same current corpus and authoritative identifiers. The final receipt and admission ledger remained unchanged after dedup-cache deletion and replay.

## Regression coverage

The run also included the existing organization, Explorer, Analytics, audit, Usage, SDK, session, storage, quota, contract, accessibility, responsive, and recovery suites. Python package tests completed 78/78; Node 22/24 SDK and consumer checks passed; Query runtime least-privilege checks passed 12/12.

## Performance observations

`read-measurements.json` contains bounded local measurements for 7/30/90-day history and batched audit reads. They are observations only, not production SLAs or capacity claims.
