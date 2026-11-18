# FEATURE-001C — final acceptance

Date: 2026-11-03, Asia/Calcutta. Task LOGHUB-FEATURE-001C.

**CONDITIONAL — APPROVAL DEPENDENCIES REMAIN.**

Follow-up clarification incorporated: the user confirms that real provider selection/registration and initial organization/verified owner selection are pending human decisions. OIDC classification is now PROVIDER_CONFIGURATION_REQUIRED. These are activation/bootstrap prerequisites and do not block the independent isolated readiness work completed below. Keycloak is recommended for architectural review, with local callback http://127.0.0.1:3200/bff/auth/callback; it has not been selected, registered or configured. The proposed asymmetric integration still requires discovery/JWKS implementation and tests before activation. A further targeted synthetic OIDC rerun passed all 17 cases (exit 0); it is a subset of the existing BFF suite, not an increase to the 311-case total. No real organization/identity/owner records or credentials were created.

The final migration candidate, ordinary runtime permissions, audit integrity and disposable backup/restore passed current checks. Targeted authentication/configuration safeguards were corrected and tested. The actual OIDC provider, real first owner/organization and current protected backup remain unresolved. No protected schema, data, role, credential, feature flag or service configuration was changed. Feature-001 is not activated; Feature-002 was not started.

## Workspace and initial state

Workspace: `C:\Users\VAMSHIKA\source\repos\skyra-tech-projects`. LogHub branch main, HEAD `19f084ad36fe37bb57ca107103e136d2d4a378be`; Platform branch main, HEAD `928ca4343ab3a1887e586123a6ba5bb88b56a0ef`. Platform was clean and remained strictly read-only.

Initial porcelain inventory had 85 entries (Git folds untracked directories), no staged changes, and the existing uncommitted FEATURE-001/001A/001B work. It is retained in `.tmp/feature001c-evidence/initial-status.txt`. Existing tracked changes covered Admin/BFF/Angular implementation, canonical/mirrored Prisma schemas, contracts, dependency overrides/lockfile and test guards. Existing untracked items included prior milestone reports, organization implementation/tests, isolated tooling, corrective/grant SQL and database approval packet. None was discarded or committed. Previous reports were reviewed alongside local source/architecture, not used as fresh acceptance evidence.

## Migration and runtime verification

[Migration readiness](SKYRA_LOGHUB_FEATURE_001C_MIGRATION_READINESS.md) contains the exact five-artifact inventory, byte lengths, hashes, tracked status, dependencies, transaction policies and ledger handling. Original ADMIN-002 remains byte-identical; no additional schema migration was required. Baseline and original SQL are tracked; A/B corrections and grants remain the pre-existing untracked files.

The owned isolated database was freshly reset/rebuilt through the baseline, original IAM, audit and tenant-consistency chain, with exact-byte staging and four successful matching ledger entries. Fresh tests proved baseline preservation, transactional failure rollback, no-wrapper partial-DDL risk, additive replay, catalog drift detection, audit FK/trigger rollback, consistency rollback/replay refusal and ACL rollback/repeat behavior. Prisma validate/status/final repeat deploy all returned 0 with no pending migrations or final catalog/ledger changes. SQL commit and Prisma resolve remain separate controlled steps; recovery reconciliation is explicit in Approval A.

Runtime is a separate non-owner, non-superuser/no-membership role. On a restored isolated database, the actual Prisma-backed OrganizationService completed a scoped authorized read and optimistic name update with exactly one correlated audit insert. Ordinary runtime audit UPDATE/DELETE/TRUNCATE, tenant DELETE, ALTER/DROP and trigger disable all failed with 42501. Owner-level trigger/FK tests additionally proved no silent audit cascade and rollback on audit failure. Composite tenant/project constraints and application tenant authorization passed. Effective ownership, table/column/schema/database/function/default-privilege catalogs are retained in readiness.json.

Audit controls protect ordinary application access, not deliberate superuser/schema-owner bypass. The database runtime is shared across tenants; database grants do not replace application tenant authorization or guarantee authenticity against stolen runtime credentials. The proposed no-hard-delete/append-only audit policy needs product acceptance; administrative retention/legal deletion duration remains a separate decision, with no arbitrary retention period or deletion feature added.

## OIDC and targeted remediation

Classification: **PROVIDER_CONFIGURATION_REQUIRED**. The user confirms no real provider is selected/configured or client/callback registered; local inspection agrees. The default development issuer and synthetic fixtures are not real-provider evidence. Architecture references corporate JWKS, while current implementation supports only HS256 and Keycloak-style fixed endpoints. No JWKS/discovery/rotation compatibility or live sign-in is certified. The companion OIDC report recommends a provider/client/callback design without provisioning it.

001C adds exact callback state expiry, nbf validation, five-second exchange abort/redirect refusal and sanitized upstream failures. Authoritative mode outside isolated test now requires explicit trust-root/endpoints/origin and strong configured OIDC/internal/session/CSRF keys, real OIDC and valid endpoint/session policy. Added tests prove missing configuration refuses startup/forwarding/persistence and default internal signing key cannot authorize organization assertions. Existing server-side opaque sessions, PKCE, nonce, issuer/audience, HttpOnly cookies and CSRF remain. No provider or secrets were invented/installed. See [OIDC security](SKYRA_LOGHUB_FEATURE_001C_OIDC_SECURITY.md) for exact tested limits and untested provider requirements.

## Backup, bootstrap and activation

[Backup/activation readiness](SKYRA_LOGHUB_FEATURE_001C_BACKUP_ACTIVATION.md) contains the exact isolated archive/targets, protected backup plan, transactional bootstrap procedure and sanitized configuration matrix.

The real disposable custom-format archive (52,458 bytes, SHA-256 `5a22b60924b208c5c20e44387689310c8672ba94cec29256a3027c742f091d29`) restored into a newly created, individually marked/manifest-guarded database on the independently verified test cluster. Schema, owners/ACLs, functions/triggers, full ledger and all table row digests matched. Runtime application sanity and corrupted-archive/guard failure handling passed. Source state was unchanged. The restricted ignored archive and two owned restore/failure databases remain available for inspection. This is not a protected database backup or cross-machine infrastructure recovery proof.

The historical protected archive path under C:\Users\jetti is absent; no current protected archive was verified. Creating one requires separate explicit authorization. The plan specifies pg_dump/pg_restore 17.9, exact protected identity, a proposed external encrypted/ACL-restricted destination, required read/lock permissions, consistency/hash/TOC checks, a new guarded restore destination and acceptance checks. No protected backup/restore occurred.

Protected tenant data is empty and IAM tables are absent. Bootstrap is necessary after A, but exact organization and verified owner's issuer/subject are missing. The existing orchestration helper is not a single atomic protected bootstrap executor. Approval B records the exact missing manifest and one-transaction procedure, audit, replay rejection, temporary maintenance credential closure and recovery requirements; its actual manifest/runner rehearsal must follow the real inputs. No arbitrary owner was created. Runtime configuration and flags remain unchanged; A/B/C are separate approvals.

## Exact current checks

All completed commands below exited **0**. The three regression group runners preserve exact commands, start times, exit codes and full logs under `.tmp/feature001c-evidence`. Test counts are fresh, not the earlier 303-case claim.

| Command | Tests/results |
|---|---|
| `node scripts/protected-catalog-snapshot.mjs before feature001c` | read-only protected baseline captured |
| `node scripts/isolated-postgres.mjs verify` | exact identity/physical storage/marker + rolled-back write probe |
| `node scripts/feature001c-regression.mjs migrations` | six sequential commands below |
| `node scripts/isolated-postgres.mjs reset` | only owned disposable DB reset |
| `node scripts/rehearse-admin-migration.mjs baseline` | fresh baseline/original, failure/repeat/drift checks |
| `node scripts/run-isolated-pg-tests.mjs` | 33/33 |
| `node scripts/rehearse-admin-migration.mjs harden` | audit failure/rollback/application/ledger checks |
| `node scripts/prepare-organization-tests.mjs` | consistency migration, constrained runtime and synthetic fixtures |
| `node scripts/run-isolated-pg-tests.mjs hardened` | 10/10 |
| `node scripts/feature001c-regression.mjs services` | nine sequential package checks below |
| `pnpm --filter @skyra/admin-service typecheck` | pass |
| `pnpm --filter @skyra/admin-service build` | pass |
| `pnpm --filter @skyra/admin-service test` | 63/63 |
| `pnpm --filter @skyra/console-bff typecheck` | pass |
| `pnpm --filter @skyra/console-bff build` | pass |
| `pnpm --filter @skyra/console-bff test` | 62/62, including six new readiness tests |
| `pnpm --filter @skyra/console-web typecheck` | pass |
| `pnpm --filter @skyra/console-web build` | pass |
| `pnpm --filter @skyra/console-web test` | 75/75 |
| `node scripts/feature001c-regression.mjs integration` | six sequential checks below |
| `node --experimental-strip-types --test tests/contracts/admin-contracts.test.ts tests/contracts/organization-contracts.test.ts` | 9/9 |
| `node --test tests/admin/isolated-target.test.mjs` | 15/15 |
| `node --test tests/organization/persistence.test.mjs` | 9 leaf cases + 1 parent, all pass |
| `node --test tests/organization/organization.e2e.mjs` | 14 leaf scenarios + 1 parent, all pass |
| `node scripts/verify-design-system-governance.cjs` | all six gates pass |
| `node scripts/sync-schemas.mjs --check` | canonical/mirror synchronization pass |
| `node scripts/rehearse-isolated-recovery.mjs` | eight recovery/security/source-preservation checks pass |
| `node scripts/verify-feature001c-readiness.mjs` | six inventory/ledger/rollback/repeat checks pass; includes guarded Prisma validate, migrate status, migrate deploy |
| `node scripts/run-isolated-compatibility.mjs` | 21/21 |
| `node scripts/protected-catalog-snapshot.mjs after feature001c` | byte-identical protected snapshot |

Total: **311 passing leaf cases/scenarios**, or 313 including the persistence/E2E parent containers; zero failed/skipped/cancelled cases in these suites. Six governance gates, six readiness checks and eight recovery checks are separate and not added to the test count. The service runner was repeated after adding the final tests; only its final results count. One approval-review timeout occurred before launching a verification command; the permitted retry succeeded. It was not a test or protected operation failure.

Real-browser E2E ran the existing complete isolated Admin → BFF → Angular path with persisted runtime authorization, sessions/CSRF, save/refresh, conflict, controlled audit failure, read-only status and real Admin outage/recovery. It also reran existing light/dark responsive/keyboard/accessibility scenarios, with six scoped axe checks passing and no fatal page errors. No frontend source was changed in C. External IdP exchange remained synthetic/test-only; these browser results do not prove real-provider interoperability. Prior package archive peer-range warnings remain a known tooling limitation; the immutable Platform packages and source were not changed to silence them.

## Protected preservation and final Git state

Both protected snapshots used startup default_transaction_read_only and an explicit repeatable-read READ ONLY transaction. Identity reconfirmed 127.0.0.1:5432 / skyra_loghub_dev / skyra_loghub_user / PostgreSQL 17.9, eight public baseline tables, one matching baseline ledger record and zero application rows. Before/after schema/constraints/indexes/enums/ledger/data digest snapshot SHA-256 is exactly `90f73c6f2bc6bce568974e27472fd652505e3034284ff4a9883104b1fd02a6ff`. It remained unchanged.

No protected DDL/DML, migrations/resolve, role/credential mutations, backup/restore, bootstrap/audit insertion, flag activation, PostgreSQL service restart or IdP account modification occurred. The isolated source and owned restore databases are physically separate from the protected service. Platform remains clean at its initial HEAD. No commit, push, reset, rebase or merge occurred.

Final LogHub inventory is retained in `.tmp/feature001c-evidence/final-status.txt` (98 folded porcelain entries, no staged files). Prior reports' hashes were rechecked unchanged. The historical database approval packet received only the requested cross-reference paragraph. C additions are the seven required reports/approval packets, three guarded rehearsal/evidence runners and two focused security test files. C also changes BFF configuration/OIDC safeguards, extends the read-only snapshot label allowlist and corrects a stale Prisma-parity message in the existing rehearsal script. The initially clean generated Angular cache was restored to its original HEAD bytes after builds; user source changes remain intact.

## Independent approval decisions and next action

| Packet | Authorization | Readiness blockers |
|---|---|---|
| [A — schema/runtime privileges](docs/admin/FEATURE_001_APPROVAL_A_SCHEMA.md) | NOT AUTHORIZED — AWAITING EXPLICIT HUMAN APPROVAL | current separately authorized/verified protected backup, named owner/security executors and credential source, approved staging/window, audit-policy acceptance |
| [B — initial bootstrap](docs/admin/FEATURE_001_APPROVAL_B_BOOTSTRAP.md) | NOT AUTHORIZED — AWAITING EXPLICIT HUMAN APPROVAL | completed A; actual organization/verified issuer+subject; exact record manifest, transactional runner/hash and rehearsal |
| [C — authoritative activation](docs/admin/FEATURE_001_APPROVAL_C_ACTIVATION.md) | NOT AUTHORIZED — AWAITING EXPLICIT HUMAN APPROVAL | completed A/B; real provider compatibility and any required JWKS/endpoints correction; managed runtime/config/session/TLS plan and exact smoke-test identities/window |

The safest next action is to **review and select the proposed identity-provider operating model**: Keycloak if the team will operate it, or a managed alternative if it will not. Only after that decision should a separately scoped task establish the real issuer/client/callback and implement/verify the selected signing/discovery contract. Organization/owner selection remains pending under B. Independently, separately scope any future protected backup authorization before making Approval A actionable. No further identity details are required to close this isolated-readiness milestone with the conditional verdict above.
