# DEV-017 Security and Data Integrity

Verdict: PASS — DEV-017 IMPLEMENTED IN ISOLATION.

| Boundary | Implementation and evidence |
|---|---|
| Audit immutability | Existing mutation transactions, append-only triggers and SELECT/INSERT-only runtime audit grants retained. Real mutation UPDATE attempt denied; actual runtime INSERT denial rolls project mutation and audit count back. |
| Current authority | Session + current authoritative membership + canonical tenant-wide audit.read. OrgOwner/OrgAdmin permitted; project roles denied. Browser cannot override tenant. |
| Export execution | Reauthenticate each page and before completion; Admin independently resolves current audit.read per call. Actual mid-export membership revocation/role downgrade discards buffered data. |
| Sessions/CSRF | HttpOnly durable sessions; POST CSRF guard. Anonymous, invalid/missing CSRF and expired durable sessions denied. Actual BFF crash recovers persisted session safely. |
| Cursor/filter | Existing HMAC keyset cursor binds tenant, reader, all filters including exact administrative correlation, page size, watermark and last timestamp/UUID. Tampered/expired/cross-reader/filter-changed cursors rejected by current and inherited audit tests. |
| Export resources | 1000 records, 5MiB, ten 100-record pages, 15 seconds; one/session, two/BFF. Bounded 1MiB upstream responses with five-second deadlines. Slots retained through response closure and pending authority settlement. |
| Cancellation/fault | Client disconnect, BFF crash, upstream timeout and server authority deadline tested. Failed traversal creates no attachment; deliberate limit truncation is explicitly marked. |
| Projection/redaction | Same public allowlist on list/detail/export; BFF reconstructs public fields. No email, credential verifier/secret, session/OIDC/internal assertion or arbitrary metadata. Unknown/corrupt/oversized details withheld. |
| CSV/JSON | All CSV cells quoted; formula-leading control/Unicode-format/space variants neutralized. Embedded Unicode, quotes and newlines tested. JSON valid UTF-8. Fixed safe filenames. |
| Actor privacy | One scoped tenant-membership batch; only current safe display name, at most80 characters, no email/secret/control/format values. Historical actor UUID never rewritten. Missing/unsafe names fall back to actor ID. |
| Administrative correlation | Existing safe details.correlationId, exact case-sensitive predicate; cursor-bound, shown/exported safely. No fabricated backfill; separate from SDK log correlation. |
| Usage authority | Server-derived tenant/actor, current quotas.read and active authorized project. History does not grant quota mutation rights. Suspended/expired readers denied; foreign/inactive projects excluded. |
| Accounting | Indexed project_usage_windows is the source; accepted and reserved kept separate. Actual SDK/WAL/admission ledger daily IDs/counts/UTF-8 bytes independently reconciled. Duplicate retry adds no charge; quota rejection adds no accepted charge. |
| Policy truth | Historical limit/utilization/exceeded fields null. Current reference explicitly named, may exceed100%, handles unlimited/zero limits without false historical percentages. Policy-change tests preserve accepted counts. |
| Scope/lifecycle | One project, strict UTC dates, ≤90 days, fixed query count. Angular clears/invalidates stale project history and cancels exports on applied-context changes. Actual held-response cross-project and UI cancellation tests pass. |
| Least privilege | No new migration/grant/write path. Existing13 migration checksums and runtime privilege separation verified after fault restoration. |
| Protected environment | Exact target verified; protected snapshots forced read-only and identical. All writes/tests confined to physically verified disposable PG17.9. |

Real-service fault matrix (15 independent scenarios):

1. Actual project mutations produce more than one safe export page
2. No session, invalid CSRF and organization/limit/cursor overrides fail without files
3. Scoped roles cannot export; OrgAdmin can; foreign tenant sees only its own context
4. Mutable safe actor name never changes immutable actor ID; unsafe name falls back
5. Mid-export membership revocation discards the actual first page before completion
6. Mid-export role downgrade is revalidated by actual Admin audit.read
7. One export per session and two per BFF remain bounded while actual pages are held
8. Client disconnect aborts actual pending download and releases the slot
9. Upstream deadline yields no partially complete file and frees export capacity
10. BFF crash interrupts export and durable session recovers
11. Audit write denial rolls the actual project mutation back
12. Suspended/revoked Usage readers lose access and inactive projects are denied
13. Concurrent authorized history readers return identical bounded daily windows
14. Expired durable session cannot export audit or read history
15. Actual PostgreSQL read outage fails closed and restart restores audit and history

Evidence: [administration-security.json](.tmp/dev017-evidence/administration-security.json), [security.log](.tmp/dev017-evidence/security.log), [contracts.log](.tmp/dev017-evidence/contracts.log), [contracts22.log](.tmp/dev017-evidence/contracts22.log), [deadline.log](.tmp/dev017-evidence/deadline.log), [audit-export-memory.json](.tmp/dev017-evidence/audit-export-memory.json), [final-audit.json](.tmp/dev017-evidence/final-audit.json). The actual service/SDK proof is separate from synthetic defensive byte-cap and malformed-projection tests.

Limits: Historical quota limits, utilization and exceeded-day states are unknown because effective policies were not snapshotted; current-policy references are explicitly nonhistorical and include pending reservations. Audit export is a watermark-bounded keyset traversal, not a shared MVCC snapshot: late commits/backdated inserts may affect later traversal; actor names are mutable current permitted labels. Small local fixtures and two-export concurrency checks are not production capacity qualification. Automated Axe checks and screenshot review are not WCAG certification. Real Entra setup, verified first organization/owner and protected activation remain pending external/human prerequisites. No production deployment, package publication, billing/alerts or DEV-018 work.
