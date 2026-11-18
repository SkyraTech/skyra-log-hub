# FEATURE-001D — Entra External ID implementation

Date: 2026-11-04, Asia/Calcutta. Scope: existing Organization Management authentication foundation. Microsoft Entra External ID customer authentication is now the selected direction; the earlier Keycloak recommendation is historical and was not provisioned. No actual Microsoft tenant/app/credential exists in available configuration.

## Existing architecture and focused changes

The Angular Console already initiated login through NestJS BFF, read safe session DTOs and guarded organization routes. BFF owned PKCE/state/nonce, opaque sessions and CSRF. Admin resolved unique issuer+subject identities and current PostgreSQL memberships/capabilities. Organization GET/PATCH, optimistic concurrency and transactional audit were already implemented. These components and the existing IAM schema were reused; no second frontend SDK, authentication module, user store, tenant schema or business feature was added.

The real path previously synthesized Keycloak endpoint URLs and accepted HS256 only. It now uses **jose 6.1.3**, exactly pinned in Console BFF dependencies/lockfile, for RS256 verification and remote JWK selection. The existing mock branch remains a separate development/test preview; it cannot be a fallback from a failed real callback. The legacy synchronous symmetric verification helper explicitly refuses use when real OIDC is selected. Real-mode membership resolution also refuses development fixture fallback, including in nonproduction mode.

## Trusted discovery and verification

`oidc-provider.ts` reads explicit OIDC_DISCOVERY_URL, exact OIDC_ISSUER_URL, application ID, directory ID and an operator-approved exact origin allowlist. This accommodates the External ID named-authority/GUID-issuer distinction without accepting arbitrary Microsoft-wide hosts or token-provided URLs. All real provider URLs require HTTPS; credentials, fragments, unapproved origins and redirects are refused. An HTTP 127.0.0.1 protocol peer is allowed only with NODE_ENV=test, SKYRA_ISOLATED_TEST_ENV=true and OIDC_ALLOW_LOOPBACK_TEST=true. These flags are absent from real configuration.

Discovery validates exact issuer, code response support, advertised RS256 and client_secret_post; advertised PKCE methods must include S256. Authorization/token/JWKS/logout endpoints must all satisfy the same explicit trust configuration. Missing/nonconforming configuration fails closed, before credentials are sent. Metadata requests are single-flight and cached for ten minutes. Metadata/body parsing is bounded: 64 KiB discovery; 256 KiB token/JWKS; five-second requests/body signal; no automatic redirects or permissive stale-metadata fallback after expiry.

The JOSE resolver selects one public signing key by kid/alg/use/key_ops, caches for ten minutes, and refreshes an unknown kid after a five-second cooldown. Same-URI metadata refresh retains the resolver/cache. Real ID tokens allow RS256 only, require a bounded nonempty kid and reject jku/jwk/x5u headers. JOSE verifies signature, exact issuer/audience, required exp/iat/sub/nonce, expiry/nbf with ten-second skew. Application checks add nonce equality, nonempty <=255-character subject, nonfuture numeric iat, azp for multiple audiences and any supplied azp, plus exact configured External ID tid. None/HS256/confusion, wrong claims and unknown keys fail with sanitized errors. Token payloads are not authentication until verification completes.

## Flow and identity mapping

Login awaits validated discovery rather than constructing provider paths. Random state/nonce/verifier and S256 are preserved. Pending state lives server-side, expires after ten minutes, is one-use, and is bounded to 1,000 pending entries. Real attempts additionally bind state to a random HttpOnly SameSite=Lax browser cookie (host-prefixed Secure name in production). A callback stolen from another browser is refused before token exchange. Return paths are relative-only, length-bounded and reject controls, backslashes and normalized external redirects.

The BFF redeems the code at the trusted token endpoint using the original verifier, exact redirect and server-only confidential client credential. It then verifies the ID token with JWKS before calling Admin. User profile id is verified sub; provider roles are discarded. Existing Admin assertions identify the configured exact issuer plus verified subject; DB identity must be ACTIVE, and active stored memberships/roles determine organization access. Entra tid is the external directory, **not** a LogHub organization ID. No email-based linking, automatic signup/bootstrap or provider-role grant occurs. Existing issuer+subject uniqueness is sufficient; no schema migration was needed. Stable subjects are app-specific; changing client registration or recreating an account requires independently verified mapping, not matching email.

## Sessions, logout and portability

Successful callback resolves authoritative membership, revokes any prior configured session and generates a fresh 256-bit opaque session ID/CSRF token. Tokens stay server-side. Existing idle/absolute expiry and fresh Admin authorization on every org request remain. Production SessionAuthGuard accepts only the configured cookie, not a weaker legacy cookie alias. Local cookies remain HttpOnly/host-only/Lax; production adds Secure. Binding-cookie cleanup follows callback success; stale pending state is rejected and removed.

CSRF-protected POST logout revokes local state and clears cookies. If configured metadata is available, BFF returns a trusted end-session URL with a fixed configured post-logout redirect and public client ID. Angular clears local state first, then follows only an HTTP(S) logout URL (HTTP restricted to loopback). Provider outage does not prevent local revocation. Front-channel global logout, refresh tokens and production certificate/federation client authentication were not added. Certificate/federation credentials are a separate production-readiness decision; this milestone implements confidential development client_secret_post.

Existing session **and pending login state** are process-local and lose state on restart. The isolated implementation is intentionally single-worker. Horizontally scaled/serverless operation requires a tested shared store with TTL, atomic consume and centralized revocation; no external infrastructure was provisioned. Azure hosting is not required by this protocol. A Vercel frontend can use an approved same-origin HTTPS /bff reverse proxy to a long-running Azure/VPS BFF; cookies, CORS/CSRF and explicit public callback URLs must be verified for that deployment. Proxy headers do not select issuer/callback/trust roots.

## File inventory and verification evidence

| Files | Purpose |
|---|---|
| `apps/console-bff/src/modules/auth/application/oidc-provider.ts` | trusted discovery, bounded exchange, JOSE/JWKS and claim verification |
| `.../oidc.service.ts`, `.../api/auth.controller.ts` | async real login, browser-bound state, session replacement, safe return paths/logout |
| `apps/console-bff/src/config/bff-config.service.ts` | captured trust configuration and fail-closed real-mode validation |
| `.../application/membership.service.ts`, `.../guards/session-auth.guard.ts` | no real-login fixture fallback; production cookie selection |
| `apps/console-bff/package.json`, `pnpm-lock.yaml` | exact maintained JOSE dependency |
| `apps/console-web/src/app/core/auth/auth.service.ts` | local logout before trusted provider navigation |
| `apps/console-bff/tests/helpers/oidc-test-provider.fixture.ts` | ephemeral RSA keys, discovery/JWKS and actual one-use code/PKCE endpoint |
| `.../tests/security/oidc-jwks.test.ts`, `auth-redirect.test.ts` | cryptographic/rotation/claim/network/redirect negatives |
| `.../tests/security/activation-readiness.test.ts`, `tests/unit/authoritative-membership.test.ts` | updated configuration and stricter startup behavior |
| `apps/console-web/tests/auth.service.test.ts` | logout navigation/state security |
| `tests/organization/organization.e2e.mjs`, `scripts/run-entra-organization-e2e.mjs` | existing browser harness reused with real signed protocol peer |
| `scripts/feature001c-regression.mjs`, `scripts/protected-catalog-snapshot.mjs` | separate D evidence label/runs and read-only snapshot label |

Five D reports/setup guide plus the explicitly permitted Approval C dependency update complete the deliverables. Approvals A and B and prior reports remain unchanged. Source and acceptance evidence are local; no remote repo was used as implementation source. Official Microsoft/JOSE documents informed protocol requirements; [setup guide](docs/auth/MICROSOFT_ENTRA_EXTERNAL_ID_SETUP.md) provides sources and exact real-registration steps. No tenant-specific Microsoft discovery document or live sign-in was available, fetched or fabricated. See [security verification](SKYRA_LOGHUB_FEATURE_001D_SECURITY_VERIFICATION.md), [isolated E2E](SKYRA_LOGHUB_FEATURE_001D_AUTH_E2E.md) and [final acceptance](SKYRA_LOGHUB_FEATURE_001D_FINAL_ACCEPTANCE.md) for current results and limits.
