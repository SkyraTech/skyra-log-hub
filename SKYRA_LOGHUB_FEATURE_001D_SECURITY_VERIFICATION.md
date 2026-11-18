# FEATURE-001D — authentication security verification

Date: 2026-11-04, Asia/Calcutta. Boundary: cryptographically verified customer authentication by Entra-compatible OIDC; authoritative authorization remains the existing LogHub Admin/PostgreSQL model. Tests use ephemeral local protocol fixtures, not Microsoft credentials or an auth bypass.

## Threat model and controls

| Threat | Implemented control / proof |
|---|---|
| Forged/unsigned/confused token | real path jose RS256-only; rejects none, HS256 with public-key material, bad signature, malformed token/missing kid; symmetric helper refuses real mode |
| Token from another issuer/app/directory | exact pinned issuer, audience and tid; azp and nonce checks; JWT expiry/nbf/iat/required-claim validation |
| Token-supplied key URL / metadata exfiltration | reject jku/jwk/x5u; explicit trusted discovery/endpoint origins; no cross-origin redirects; untrusted endpoint metadata refused before token credential transmission |
| Stolen code / login CSRF / replay | random state+nonce and PKCE S256; server-side verifier; one-use expiring state and code; real callback additionally requires its browser binding cookie |
| Session fixation | callback replaces prior session with fresh random ID; browser test verifies old ID is refused |
| Provider roles/email granting organization access | verified iss+sub lookup, ACTIVE internal identity and stored membership; provider roles stripped; signed OrgOwner claim cannot elevate Viewer/no-member |
| Revoked authorization in old session | current Admin DB authorization per org operation; established signed-provider session denied on next request after revocation |
| Mutation CSRF / wrong tenant | existing origin/token checks and server-selected tenant/internal assertion scope; full API-path denial/conflict tests |
| Key rotation / key-fetch flooding | fixed JWKS URI; ten-minute cache, five-second cooldown; rotated published key accepted after bounded refresh; unknown key remains refused |
| Unbounded upstream response / unavailable provider | five-second abort, size limits, strict metadata/token shape, no secret-bearing error text; invalid/unavailable discovery/JWKS/exchange denied |
| Callback open redirect | bounded relative path with normalization/control/backslash restrictions; focused attack regression |
| Cookie downgrade / token exposure | HttpOnly host-only sessions; Secure production; configured-cookie-only production guard; tokens excluded from safe session DTO/browser storage; trusted logout URL carries no token |

Missing required real-provider configuration now stops startup even if authoritative membership is off. The separate mock preview remains a known development/test mode, but real-mode failures never select it; authoritative preview use outside NODE_ENV=test is refused. All real-provider endpoint URLs require approved HTTPS origins. Loopback provider HTTP requires the three explicit isolated test controls together. There is no allow-any-algorithm, token URL override or permissive missing-key path.

## Cryptographic and protocol verification

The controlled provider creates fresh RSA-2048 signing keys in memory. No private keys, secret values, ID/access tokens or cookies are written into evidence. Its real authorization endpoint creates random one-use codes and captures nonce, exact redirect and S256 challenge; token exchange validates confidential client, exact redirect, verifier and code reuse before signing an ID token. The production BFF's ENABLE_MOCK_OIDC is false in the signed-provider integration.

The security suite tests valid signature and discarding provider roles; wrong signature/issuer/audience/nonce/tid/azp; expired and future tokens; missing exp/iat, future iat and nonnumeric nbf; none/HS256 confusion; missing kid/malformed token; unknown kid and forbidden jku. Discovery tests reject wrong issuer, untrusted token/JWKS origins, unsupported signing/client-auth/PKCE metadata, malformed metadata and redirects. Invalid/unavailable JWKS and closed-provider network failures refuse verification. PKCE mismatch, browser-binding mismatch, state reuse and successful code exchange are tested through actual local protocol endpoints.

Rotation test first verifies one known key, publishes a second key, confirms a miss during cooldown does not trigger an immediate extra fetch, waits 5.1 seconds, then accepts the correctly signed new kid after refresh. This proves new-key handling, not immediate revocation of a cached old key. A removed old key may remain usable up to the ten-minute key-cache age. During expired-cache fetch failure authentication fails closed; there is no unbounded stale fallback. Rate limits, emergency cache purge/session invalidation and production outage monitoring remain deployment policy.

## Session, CSRF and full-path proof

Existing session/CSRF unit tests continue to verify missing/invalid/idle/absolute-expired sessions, revocation, bounded memory and origin/token validation. Browser acceptance adds real signed-provider session replacement, old-ID rejection, local/provider logout, missing/revoked membership denial and next-request revocation. Organization tests use actual Admin/BFF/Prisma/PostgreSQL; audit rollback, cross-tenant refusal, CSRF denial, ETag conflict and ordinary-runtime DDL/audit mutation denial continue to pass. Angular tests verify that local state is cleared before following a provider logout URL and that javascript URLs are not followed.

No real Entra tenant/client/key registration was available. These results establish standards-compatible implementation in isolation, **not** successful Microsoft customer sign-in, MFA/policy behavior, account recovery or real issuer/JWKS deployment configuration. Exact commands/counts are in [final acceptance](SKYRA_LOGHUB_FEATURE_001D_FINAL_ACCEPTANCE.md); logs are under `.tmp/feature001d-evidence`.

## Explicit limits and approval dependencies

Session/pending state are process-local; a shared durable store and tests are required before multi-instance/serverless production. The same-origin TLS/reverse-proxy/cookie plan must be verified on the chosen hosting. Client_secret_post is implemented for development; Microsoft-recommended production certificate/federation credential handling is not implemented. No token refresh, global front/back-channel sign-out or automatic IdP account revocation synchronization was added. Local logout remains reliable during provider outage, but remote SSO logout is then not claimed. Fresh DB membership checks remain the application authorization boundary.

No production secrets were generated/installed. Test RSA keys and confidential credentials are ephemeral process memory. The first organization/owner is still unselected/unverified. A/B/C remain independent and unauthorized; no protected SQL, role mutation, backup/restore, bootstrap or flags were executed. There is no identified critical unresolved defect in the exercised single-worker isolated path; the listed live-provider and deployment requirements remain mandatory activation prerequisites.
