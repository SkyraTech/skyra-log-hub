# DEV-016 End-to-End Acceptance

PASS in isolation. Actual packaged SDK → Gateway → WAL → canonical JSONL / derived Parquet → Query → BFF → real Angular verified. No mocked business aggregates substitute for the same-event run.

Fresh cohort: 87 canonical SDK events; current 60, previous 25, two admitted outside both half-open ranges. Six services, six severities, production/staging, exact/case-variant/absent correlations, boundary and empty buckets. A lost acknowledgement forces an identical batch-ID/body retry; durable duplicate response causes no extra charge. Foreign tenant/project cohorts remain excluded. Independently reduced event identities/counts match archive, search, dashboard and drill-downs.

Current full-scope metrics: 60 events, 20 error/fatal, eight warnings, six services, 33.3333% error rate. JSONL and Parquet-only evaluations reconcile; corrupt derived Parquet falls back to canonical JSONL. Missing current/previous/both files produce explicit partial/unavailable states, suppress changes and recover after restoration. Usage counts admission-time 87 while the two occurrence-time periods count 85.

## Real browser scenarios

1. DEV016 official SDK cohort and lost acknowledgement retry preserve actual WAL/JSONL identities and admission totals
2. DEV016 JSONL current/previous metrics, zero buckets, service rankings and canonical event IDs reconcile independently
3. DEV016 foreign tenant/project SDK events and request overrides never alter authorized correlation scope
4. DEV016 Angular KPI comparisons and keyboard service-bucket drill-down show the same authorized event IDs
5. DEV016 combined correlation/service/severity/environment deep links preserve all Analytics constraints
6. DEV016 off/manual refresh and rapid repeated commands never overlap held work
7. DEV016 real 15-second automatic refresh makes one authenticated bounded request
8. DEV016 real 30-second automatic refresh makes one authenticated bounded request
9. DEV016 controlled hidden-document state suppresses real polling and visible state resumes safely
10. DEV016 leaving Analytics destroys the route-owned refresh timer
11. DEV016 delayed old responses cannot overwrite a changed correlation or project
12. DEV016 saved preferences survive page refresh, BFF crash and an actual cold browser with new signed session
13. DEV016 browser preference conflict requires restore and reset advances the version
14. DEV016 partial current/previous/both source states suppress comparisons and recover without fabricated zeros
15. DEV016 real Query outage and held-response deadline retain data only as visibly stale
16. DEV016 Parquet-only comparisons/service buckets and corrupt-cache JSONL fallback preserve canonical results
17. DEV016 back/forward and direct refresh retain authorized project, fixed bounds and case-sensitive correlation
18. DEV016 six responsive light/dark Axe scans, reduced motion and keyboard controls remain accessible
19. DEV016 concurrent authenticated users and maximum tested service/time scope stay bounded
20. DEV016 revocation and session expiry stop authenticated browser polling
21. DEV016 logout leaves no timer; event-time Analytics and admission-time Usage reconcile without conflation

The full runner passes 68 independent leaves (69 TAP tests including the parent). Controlled document.hidden + visibilitychange drives real 15/30-second timers; this is not proof of native OS background-tab scheduling. Focused tests additionally enforce an actual Query engine deadline, save during pending evaluation, and destroyed-route pending preference restore. Focused visual-only run verifies compact inputs and all six computed-theme/Axe combinations; normal focused run includes these checks too.

## Test accounting

Counts below are independent passing leaves within each log. Do not sum them as unique requirements: broad suites include focused unit contracts and some shared tests. Node versions are distinct executions of unchanged code.

| Log | Pass leaves | Failed leaves |
|---|---:|---:|
| contracts.log | 49 | 0 |
| contracts22.log | 49 | 0 |
| preferences.log | 11 | 0 |
| preference-migration.log | 5 | 0 |
| dev015-saved-searches.log | 14 | 0 |
| dev015-migration.log | 5 | 0 |
| dev015-export-faults.log | 20 | 0 |
| dev015-contracts.log | 40 | 0 |
| dev015-contracts22.log | 40 | 0 |
| refresh-facade.log | 14 | 0 |
| integrated-browser.log | 68 | 0 |
| sdk-tests24.log | 103 | 0 |
| sdk-tests22.log | 103 | 0 |
| core-contracts24.log | 66 | 0 |
| core-contracts22.log | 66 | 0 |
| ingestion-gateway-tests.log | 124 | 0 |
| admin-service-tests.log | 98 | 0 |
| bff-tests.log | 115 | 0 |
| console-tests.log | 122 | 0 |
| query-tests.log | 232 | 0 |
| target-guards.log | 15 | 0 |
| quota-integration.log | 16 | 0 |
| quota-boundaries.log | 4 | 0 |
| admin-postgres-hardening.log | 10 | 0 |
| credentials-persistence.log | 28 | 0 |
| audit-persistence.log | 10 | 0 |
| developer-documentation.log | 4 | 0 |
| developer-sample.log | 8 | 0 |
| storage-lifecycle.test.log | 15 | 0 |
| storage-ownership.test.log | 4 | 0 |
| storage-database-restart.log | 1 | 0 |
| session-migration.log | 5 | 0 |
| session-persistence.log | 15 | 0 |
| session-http-security.log | 11 | 0 |
| session-outage-recovery.log | 4 | 0 |
| session-cleanup-recovery.log | 1 | 0 |
| sdk-gateway-lifecycle.log | 6 | 0 |
| sdk-app-exit.log | 2 | 0 |

Python: 78 passing full-suite tests ([python-full-unsandboxed.json](.tmp/dev016-evidence/python-full-unsandboxed.json)). Earlier sandbox execution stalled in asyncio socketpair construction; unchanged suite passed with loopback available. Earlier SDK network-sandbox, Windows shell/file-URL and offline critical-CSS failures were diagnosed and retained as superseded evidence; final successful evidence is explicitly named here.

## Local measurements

Successful measured dashboard HTTP requests: 27; median 355.2ms, p95 658.6ms, maximum 823.5ms; largest measured body 142006 bytes. BFF sampled RSS maximum 115.0MiB / heap 40.0MiB; Query RSS 154.6MiB / heap 36.6MiB. Sampling interval100ms during the final Analytics scenario window; process restarts included. Real automatic refresh15/30s and bounded maximum seven-day/168-hourly-bucket request verified. Manual fault/hold durations are not normal latency benchmarks.

Measured HTTP metrics, SQL execution/scanned bytes, sampled BFF/Query RSS/heap and their exact time range are in [performance.json](.tmp/dev016-evidence/performance.json). These are local small-cohort measurements, not production capacity or guaranteed peak memory. Preference table/index footprint is in [final-audit.json](.tmp/dev016-evidence/final-audit.json).

Evidence: [analytics-event-manifest.json](.tmp/dev016-evidence/analytics-event-manifest.json), [analytics-jsonl-dashboard.json](.tmp/dev016-evidence/analytics-jsonl-dashboard.json), [analytics-parquet-dashboard.json](.tmp/dev016-evidence/analytics-parquet-dashboard.json), [advanced-analytics-e2e.json](.tmp/dev016-evidence/advanced-analytics-e2e.json), [analytics-accessibility.json](.tmp/dev016-evidence/analytics-accessibility.json), [test-counts.json](.tmp/dev016-evidence/test-counts.json). Additional visual/race evidence is in [.tmp/dev016-focused-evidence](.tmp/dev016-focused-evidence).
