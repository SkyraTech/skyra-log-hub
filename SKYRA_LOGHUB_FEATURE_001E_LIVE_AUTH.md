# FEATURE-001E — live authentication evidence

Date: 2026-11-04, Asia/Calcutta. **Actual Microsoft login: NOT RUN — REAL PROVIDER REQUIRED.**

The user confirms setup is pending. No actual customer tenant/app/client ID, discovery URL, confidential credential, user-flow association, registered callback/logout URI or approved real development customer identity is available. No Microsoft account or resource was opened/changed, no credential generated, and no Microsoft-issued token obtained. No fabricated session or arbitrary owner grant was used to claim success.

## Evidence boundaries

| Verification layer | Outcome |
|---|---|
| Official Microsoft setup/redirect documentation | reviewed; exact manual steps in updated setup guide |
| Real external tenant's public metadata | NOT RUN — REAL PROVIDER REQUIRED |
| Real Microsoft browser authorization-code/PKCE flow | NOT RUN — REAL PROVIDER REQUIRED |
| Microsoft-issued ID-token/JWKS verification | NOT RUN — REAL PROVIDER REQUIRED |
| Real identity session/authorization outcome | NOT RUN — REAL PROVIDER REQUIRED |
| Real provider plus isolated organization save/audit/logout | NOT RUN — REAL PROVIDER REQUIRED |
| Local JOSE/discovery/state/session/CSRF regression | run using deterministic synthetic configuration, separate service logs |
| Controlled RSA/JWKS provider plus actual Admin/BFF/PostgreSQL/Angular | run separately; not Microsoft login evidence |

## Local protocol/browser verification

The normal existing mock-preview organization suite and the mock-disabled signed-provider suite use the separately guarded PostgreSQL 17.9 instance at 127.0.0.1:5433, exact database skyra_loghub_disposable_validation, marker `26d25080-7655-4147-b05a-512ad359e14f`, independent credentials and verified `.tmp/feature001a-postgres/data`. The harness verifies live marker/runtime identity and separately verifies the administrator's physical data directory before test writes. Application operations use the non-owner runtime role, not the test administrator.

The signed peer generates ephemeral RSA keys, serves discovery/JWKS and validates real one-use code+PKCE exchange. It runs only on an explicitly enabled test loopback exception; the BFF uses ENABLE_MOCK_OIDC=false. No private keys/tokens/cookies/credential values are written to reports. Source usernames and directory IDs belong to labelled synthetic fixtures, not actual Microsoft customers. Existing isolated identities temporarily mapped to that synthetic issuer are restored in finally cleanup. No new real-identity membership fixture was created.

Literal-IP and separately selected localhost browser profiles are exercised using allocated local ports and the existing same-origin proxy to actual BFF/Admin services. The callback path is `/bff/auth/callback`. These runs test browser-bound state, host-only HttpOnly session cookies, Lax top-level callback behavior, new-session/old-ID refusal, CSRF, provider/local logout, revoked/missing memberships, tenant scope, organization name persistence, audit rollback and concurrency. Default fixed port 3200 is source-verified; these allocated-port tests do not prove Microsoft registered port 3200. The final acceptance table records each command/profile/count separately.

The first signed rerun exposed an existing browser-test timing race: a 400 ms sleep could complete before the loading-state assertion began. One leaf and its parent were reported failed (17 pass / 2 fail among 19 reported). The application continued passing save/audit and authorization scenarios. The test now gates the real GET/PATCH request until loading/saving assertions complete, then continues to the actual backend. No fake response or production auth change was introduced. Original failure evidence is retained as `.tmp/feature001e-evidence/initial-signed-failure.log`; final rerun evidence is listed separately.

## Expected real identity handling after setup

A successful Entra signature/claim validation does not grant a LogHub organization. An unmapped internal identity can be refused by the authoritative directory before a local session is created; a mapped ACTIVE identity with no active organization membership can have no accessible organization. Neither denial alone is proof of real Microsoft verification: retain sanitized server-phase/correlation evidence from the actual configured flow, without raw tokens.

Only after an explicitly authorized real development identity is independently verified may its exact issuer+subject be mapped to a clearly labelled isolated test tenant/membership. Obtain specific fixture permission first, verify the disposable target again and define audit/cleanup behavior. No email-only linking or provider-role-derived OrgOwner is permitted. Audit history is append-only, so removability must not mean deleting immutable audit rows or dropping guards; use documented deactivation/expiry and bounded disposable-database lifecycle instead. No such real-identity fixture was authorized/created in E.

Protected 5432 was not connected to or modified in this milestone. The D snapshot is historical evidence only, not a newly performed E catalog check. No protected migration, role change, identity/owner/bootstrap/audit insertion, backup/restore, flag activation or deployment occurred. Real-provider work remains pending manual external configuration; local passing tests cannot substitute for it.
