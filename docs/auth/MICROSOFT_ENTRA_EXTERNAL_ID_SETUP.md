# Microsoft Entra External ID — LogHub development setup

Prepared 2026-11-04 (Asia/Calcutta). Provider selected: Microsoft Entra External ID **customer external tenant**. No real tenant, application, secret or sign-in was created/tested by FEATURE-001D. The instructions below are user actions for a separately authorized setup, not evidence of registration or protected activation. All three protected approvals remain unauthorized.

## FEATURE-001E — current user-controlled setup handoff

Rechecked 2026-11-04: the user confirms **setup pending**: the real development tenant and BFF registration are not completed. This workspace/process still has no real issuer, directory/client IDs, discovery URL or callback registration evidence, and no BFF/Admin/Console environment file. No Microsoft administration connector was available for verified tenant inspection; no authenticated portal was opened or modified. These are user-confirmed pending actions, not an automated inventory of your Microsoft account. If resources already exist, reuse and review them before creating duplicates.

The first user action is to open the [Microsoft Entra admin center](https://entra.microsoft.com), select the intended development directory and confirm it is a **customer external tenant**. If none exists, review the subscription/trial/region choices in section 1 before you, as account owner, create it. This task does not authorize an agent to click Create/Register or change a flow/credential/account on your behalf.

Then complete this manual sequence using the detailed sections below:

1. In the selected external directory, review App registrations for an existing development BFF. If absent and you choose to create it, use the proposed name **Skyra LogHub — Development BFF**, the tenant's single-directory account option, and the **Web** platform. Keep the real client ID and directory ID as public configuration references.
2. Choose the development customer sign-in method yourself (for example an approved email/password or email one-time-passcode flow). Create/select that customer user flow and associate this exact BFF application through its Applications page. No extra social provider or B2C custom policy is required by LogHub. [Microsoft customer flow instructions](https://learn.microsoft.com/en-us/entra/external-id/customers/how-to-user-flow-sign-up-sign-in-customers) describe the supported choices; [application association](https://learn.microsoft.com/en-us/entra/external-id/customers/how-to-user-flow-add-application) is a separate required step.
3. Resolve the callback registration choice explicitly using the table below. Do not switch an already-started browser login between hosts. Record the URI the portal actually accepted, not merely a proposed local value. Register the chosen public post-logout target as described in section 5.
4. Copy the external tenant's actual OpenID metadata document URL from the application's Endpoints view; inspect that public JSON without credentials. Record its exact issuer and endpoint origins, actual client/directory IDs and user-flow association. Stop for review on a workforce/common/B2C endpoint or an unexpected origin/algorithm.
5. Only you or an explicitly approved administrator creates the development confidential credential, if needed. Store its value privately in the approved environment-specific secret store; provide a reference/presence confirmation, never its value in chat. Nothing in this guide generates a secret or installs one automatically.
6. Return only the public tenant domain/directory ID, client ID, discovery URL, exact registered callback/logout URIs, selected user-flow name/association and approved development customer-identity permission. That enables real metadata review and a scoped live sign-in. Keep protected flags off; any real-identity fixture requires explicit permission and must be confined to the guarded disposable database.

| Local profile | Status and required consistency |
|---|---|
| `http://127.0.0.1:3200/bff/auth/callback` | Current source default; controller route and bind defaults verified. Fresh synthetic browser tests exercise the same IP/route/cookie/state/CSRF/logout behavior on allocated ports. Microsoft acceptance at port 3200 is unverified; HTTP IP registration has the manifest restriction described below. No host switch was made. |
| `http://localhost:3200/bff/auth/callback` | Verified as a local profile in E: all 18 signed-provider browser scenarios pass through a localhost public callback/proxy and the loopback backend, on allocated ports. This includes browser binding, HttpOnly host-only session, Lax callback, CSRF and logout. Port 3200 is the source default, not a Microsoft-registered URI yet. Change callback, browser BFF URL, frontend host/origin allowlist and logout URL together; restart BFF and discard old cookies/pending states before a real attempt. |

Microsoft's current [redirect rules](https://learn.microsoft.com/en-us/entra/identity-platform/reply-url) allow local HTTP and distinguish localhost matching from literal-IP matching. Its localhost port exception is not a reason to configure different ports/paths in LogHub. The chosen registered URI, BFF redirect configuration and browser flow must still agree. Prefer a reviewed HTTPS development proxy if the chosen registration cannot safely support the intended HTTP profile. No wildcard origin/redirect or disabled state validation is a workaround.

Until those public inputs and private credential setup are available, real metadata checks, Microsoft browser login and real-provider organization E2E are **NOT RUN — REAL PROVIDER REQUIRED**. Local JOSE/session/CSRF and controlled-provider tests remain separate synthetic evidence. Production shared session/pending-state storage, TLS/proxy and credential requirements in section 5 still apply.

If you select the portal-friendly **localhost** profile, use the following public local settings consistently. These are proposed development values, not installed settings or registered resources:

```dotenv
BFF_HOST=127.0.0.1
BFF_PORT=3200
OIDC_REDIRECT_URI=http://localhost:3200/bff/auth/callback
OIDC_POST_LOGOUT_REDIRECT_URI=http://localhost:4200/login
BFF_ALLOWED_ORIGINS=http://localhost:4200
COOKIE_SAME_SITE=lax
SESSION_COOKIE_NAME=skyra-session
```

Open Angular at `http://localhost:4200` and set its browser-safe BFF base URL to `http://localhost:3200`, or use a reviewed same-origin `/bff` development proxy. The loopback socket may bind 127.0.0.1 while the browser/public registration uses localhost; confirm IPv4 resolution/listener access. The E test verified that arrangement through a same-origin proxy. Keep actual issuer/discovery/JWKS/token endpoints on the real tenant's approved HTTPS origins; local application callbacks do not enable an HTTP real-provider exception. Other OIDC secrets/IDs remain unset until supplied through the procedures below. This alternative does not silently replace the earlier literal-IP template.

## 1. Tenant and customer flow — Microsoft instructions

Use an external tenant, not a workforce directory or an Azure AD B2C policy. Microsoft's [external-tenant creation guide](https://learn.microsoft.com/en-us/entra/external-id/customers/how-to-create-external-tenant-portal) currently documents Entra ID > Overview > Manage tenants > Create > External. Its subscription path requires appropriate tenant-creation privileges; an eligible first-time trial may not require a subscription. Review billing, country/region and operational ownership before creating anything. Select/switch to the customer external tenant and retain its actual Directory (tenant) ID and domain. No example ID in this repository is your tenant.

In that tenant, create the customer sign-up/sign-in flow at Entra ID > External Identities > User flows > New user flow. Choose the approved customer authentication methods and attributes; do not add unrelated provider/Graph permissions. See [create a customer user flow](https://learn.microsoft.com/en-us/entra/external-id/customers/how-to-user-flow-sign-up-sign-in-customers). The flow authenticates customers; it does not create a LogHub organization membership or OrgOwner grant.

## 2. Register the BFF — Microsoft instructions plus LogHub choices

Following [application registration](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app), switch to the external tenant, open Entra ID > App registrations > New registration and select the supported account type appropriate to that external tenant (the tenant's own customer directory). LogHub SaaS organizations are application-level entities; that does not require a `/common` workforce multi-directory authority. Record the real Application (client) ID and Directory (tenant) ID.

Choose the **Web** platform for the NestJS BFF. Angular is not exchanging tokens, so do not use an SPA/public-client registration, implicit flow or a browser client secret for this integration. Use authorization code plus PKCE S256 and the existing scopes openid/profile/email. Add the application to its intended user flow using the flow's Applications page; Microsoft's [add application guide](https://learn.microsoft.com/en-us/entra/external-id/customers/how-to-user-flow-add-application) explains the association. Do not skip it and mistake a successful directory account creation for a configured application sign-in flow.

The existing BFF serves `/bff/auth/callback` and defaults to port 3200. Proposed local registration:

```text
http://127.0.0.1:3200/bff/auth/callback
```

This URI is **not registered or accepted by Microsoft yet**. Microsoft documents that adding an HTTP 127.0.0.1 redirect currently requires the application manifest's replyUrlsWithType rather than the portal redirect textbox. Confirm the current manifest schema with [redirect restrictions](https://learn.microsoft.com/en-us/entra/identity-platform/reply-url); do not blindly paste obsolete manifest JSON. If registration policy rejects this local URI, use an approved local HTTPS reverse proxy and register its exact callback, or deliberately choose localhost consistently across frontend/BFF/configuration. Do not broaden to wildcard callbacks. Keep separate registrations for development and deployment.

## 3. Discover the actual customer authority and signing keys

Microsoft documents App registrations > your application > Endpoints > OpenID Connect metadata document in its [OIDC guide](https://learn.microsoft.com/en-us/entra/identity-platform/v2-protocols-oidc). Obtain the **external tenant's** metadata, not a workforce `/common`, `/organizations` or an old B2C policy URL. The customer authority uses a tenant-specific ciamlogin.com host (or separately approved custom domain). The [Microsoft authority reference](https://raw.githubusercontent.com/AzureAD/microsoft-authentication-library-for-js/dev/lib/msal-common/docs/authority.md) notes that discovery may return a tenant-GUID issuer host even when authority used a named host.

Read only that approved public metadata URL, without a client secret/token, and record:

- Exact `issuer`, including path/trailing slash: this is OIDC_ISSUER_URL, not a guessed concatenation of the authority.
- Exact discovery document URL: OIDC_DISCOVERY_URL.
- Actual authorization_endpoint, token_endpoint, jwks_uri and end_session_endpoint.
- RS256 in id_token_signing_alg_values_supported; authorization response type code; client_secret_post support for this development client; S256 support if advertised.
- Exact HTTPS origins for the discovery URL, issuer and all four endpoints: OIDC_TRUSTED_ENDPOINT_ORIGINS. Approve only the specific named/GUID origins needed for this tenant, without wildcard ciamlogin.com or token-provided key URLs.

These are templates for recognition only, never configured resources:

```text
Authority family: https://<actual-external-tenant-name>.ciamlogin.com/<actual-tenant-identifier>/
Discovery family: <tenant-specific-authority>/v2.0/.well-known/openid-configuration
Issuer: copy EXACTLY from the verified metadata; it may use the tenant GUID host
```

Do not infer JWKS/authorize/token paths from these examples. LogHub now reads them from validated metadata. RS256 is the only real-login algorithm allowed in code. Actual metadata must confirm it before activation. Microsoft describes published-key verification and rollover in [signing-key guidance](https://learn.microsoft.com/en-us/entra/identity-platform/signing-key-rollover); the isolated test proves the implementation contract, not this tenant's metadata or live login.

## 4. Confidential credential and safe configuration

For development, an authorized application administrator can use the app's Certificates & secrets section to create an approved, expiring client secret and capture its **value** once into the approved secret store. Do not send it in chat, commit it, use its secret ID as its value, or expose it to Angular. Review Microsoft's [web-app quickstart](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-web-app-sign-in?pivots=external) and [authorization-code protocol](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow). The implementation supports client_secret_post, not private_key_jwt or certificate client authentication. Microsoft recommends certificates/federated credentials for production; production credential strategy therefore requires a separate reviewed change before that deployment, not an undocumented switch in this template.

The following is a **non-executable public/server-only template**. Replace placeholders with values verified above and inject secret values through your approved secret mechanism. BFF reads process environment; placing a file next to it does not automatically load dotenv. Do not install this template against protected PostgreSQL or enable authoritative flags under this milestone.

```dotenv
# Public metadata, server configuration; not values registered by this task
NODE_ENV=development
ENABLE_MOCK_OIDC=false
OIDC_ISSUER_URL=<exact-metadata-issuer>
OIDC_DISCOVERY_URL=<approved-tenant-specific-discovery-url>
OIDC_TENANT_ID=<real-external-directory-guid>
OIDC_CLIENT_ID=<real-application-client-guid>
OIDC_REDIRECT_URI=http://127.0.0.1:3200/bff/auth/callback
OIDC_TRUSTED_ENDPOINT_ORIGINS=<comma-separated-exact-https-origins-for-this-tenant>
OIDC_POST_LOGOUT_REDIRECT_URI=http://127.0.0.1:4200/login
BFF_HOST=127.0.0.1
BFF_PORT=3200
BFF_ALLOWED_ORIGINS=http://127.0.0.1:4200
ADMIN_SERVICE_URL=http://127.0.0.1:3300
SESSION_COOKIE_NAME=skyra-session
COOKIE_SAME_SITE=lax
SESSION_IDLE_TIMEOUT_MS=1800000
SESSION_ABSOLUTE_LIFETIME_MS=28800000
# Kept off pending schema/bootstrap/activation approvals:
BFF_USE_AUTHORITATIVE_MEMBERSHIP=false
# Server-only secrets: values injected externally, never these placeholders
OIDC_CLIENT_SECRET=<secret-store-reference-resolved-to-value-at-launch>
SESSION_SECRET=<independent-managed-secret-at-least-32-characters>
CSRF_SECRET=<independent-managed-secret-at-least-32-characters>
INTERNAL_JWT_SECRET=<independent-admin-bff-managed-secret-at-least-32-characters>
INTERNAL_JWT_ISSUER=<approved-matching-internal-issuer>
INTERNAL_JWT_AUDIENCE=<approved-matching-admin-audience>
```

Do not include NODE_ENV=test, SKYRA_ISOLATED_TEST_ENV or OIDC_ALLOW_LOOPBACK_TEST in any real-provider deployment. The loopback HTTP OIDC *provider* exception requires all three test controls and is only for the controlled local test peer. Real discovery/JWKS/token endpoints always use approved HTTPS origins. HTTP on the proposed local application callback is a separate development-only exception.

Admin server-only requirements, after separate approval: runtime DATABASE_URL for skyra_org_runtime, explicit TRUSTED_OIDC_ISSUERS equal to the verified issuer, matching INTERNAL_JWT_* settings, and ADMIN_PERSISTENCE_ENABLED=true only at its authorized gate. Migration credentials must never be used by Admin. No database schema change or second identity store is needed. The Angular browser receives only its public BFF base URL; all OIDC keys, secrets, discovery allowlists and provider tokens stay server-side. Cookie Domain is intentionally omitted: use host-only cookies, not a broad parent-domain cookie.

## 5. Logout and deployment portability

Configure the public post-logout URI in both LogHub and the application registration. Microsoft requires post_logout_redirect_uri to match a registered redirect URI. Proposed local value is `http://127.0.0.1:4200/login`; register it with the appropriate Web platform/loopback handling as well as the callback. It is not a front-channel logout handler. LogHub's CSRF-protected POST logout revokes its session, clears cookies and returns a URL built from trusted end_session_endpoint plus the fixed configured post-logout target. Angular follows it after clearing local state. If provider metadata is unavailable, local revocation succeeds without claiming Microsoft SSO logout. Cross-application front/back-channel logout and automatic token refresh are not implemented. See [Microsoft logout behavior](https://learn.microsoft.com/en-us/entra/identity-platform/v2-protocols-oidc#send-a-sign-out-request).

For Vercel frontend testing, Azure or Hostinger backend, prefer one public HTTPS console origin with `/bff/*` reverse-proxied to the long-running BFF. Register `https://<approved-console-host>/bff/auth/callback` and its exact public logout target. Forward Set-Cookie correctly; keep cookies host-only, HttpOnly, Secure and SameSite=Lax. Do not solve cross-site cookie blocking by widening CORS or disabling CSRF. Explicitly configure allowed console origins; callback URLs do not derive from Host/X-Forwarded-* headers. Fastify currently does not implicitly trust forwarded headers. Terminate TLS at a reviewed proxy, protect the backend network path and keep Admin private. A static Vercel frontend alone does not host BFF sessions, ingestion workers or PostgreSQL.

The current session and pending-state maps are process-local. Single-process isolated testing is verified; multi-instance/serverless deployment is **not production-ready**. Before scaling, use an approved shared session **and pending login state** store with TTL/atomic one-time consumption, protected token material, centralized revocation, failure-closed behavior and its own tests. Sticky routing alone does not provide restart durability. No Redis/Azure session infrastructure was provisioned. Certificate/federation client authentication, live provider sign-out and actual proxy/cookie topology remain production-activation decisions.

## 6. First real test and diagnosis — future authorized steps

First share/review only public tenant/client/metadata/callback details. An actual Entra sign-in may establish a verified issuer+subject, but LogHub refuses access without a separately approved matching internal identity and active membership. Do not auto-bootstrap that person, infer organization from Entra tid, map by email, or accept provider OrgOwner roles. Microsoft's [ID-token claim reference](https://learn.microsoft.com/en-us/entra/identity-platform/id-token-claims-reference) distinguishes sub, oid and tid. Existing unique `(issuer,subject)` is retained; subject is application-specific, so changing app registration can require a separately verified identity remap. Recreated accounts do not inherit authorization by reusing an email.

Only after separate A/B/C approvals: inject approved non-owner runtime configuration, enable the flags in the reviewed order, start BFF through the public origin, use its normal login route, verify a fresh opaque cookie/session and authoritative organization read, and perform only the specifically approved audited update. Record sanitized status/correlation/audit references, not tokens or cookies. This live procedure has **not been run**.

| Symptom | Check without exposing secrets |
|---|---|
| AADSTS50011 / callback mismatch | exact scheme/host/path/case; actual registered Web URI; 127.0.0.1 manifest restriction; public proxy callback |
| Discovery failure | external tenant selected, real metadata URL/issuer, exact origin allowlist, HTTPS/timeout/response contract; do not use common/B2C |
| Audience/tenant rejection | Application (client) ID, exact issuer and external directory GUID, correct app/user-flow association |
| Invalid client/code | credential value vs ID, expiry, confidential Web client, client_secret_post support, exact redirect and PKCE; never log request body |
| Missing/replayed browser state | same browser and origin, binding cookie accepted, ten-minute expiry, one active login attempt, shared-state topology |
| Authenticated but denied organization | separately approved issuer+subject identity is ACTIVE; stored membership/role is active; provider roles do not grant access |
| Missing cookie or repeated login | same-origin BFF proxy, Secure/HTTPS, consistent localhost vs IP, host-only cookie/path, correct SameSite and credentialed requests |
| Unknown kid | approved JWKS available, published rotation, five-second refresh cooldown and ten-minute key-cache limit; never trust token jku |

Before live-provider verification, do not describe this guide, sample placeholders or the controlled issuer as a real Microsoft registration. All provider setup and production hosting decisions remain with the user.
