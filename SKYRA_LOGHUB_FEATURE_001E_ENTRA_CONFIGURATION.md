# FEATURE-001E — real Entra configuration status

Date: 2026-11-04, Asia/Calcutta. **CONDITIONAL — LOCAL INTEGRATION READY, USER SETUP PENDING.**

The user explicitly confirms that the real Skyra development external tenant and BFF app registration are not completed. No public real-provider identifiers or registered URIs have been supplied. Local process OIDC variables are unset, no OIDC client credential is present in that process, and no BFF/Admin/Console `.env*` file exists. Sanitized inspection is `.tmp/feature001e-evidence/initial-inspection.json`. Existing development defaults and controlled-provider identifiers are not real Microsoft configuration.

| Item | Actual real-provider status |
|---|---|
| Customer external tenant/domain/directory ID | setup pending; no verified values |
| Development Web BFF application/client ID | registration pending; no verified client ID |
| Customer sign-up/sign-in flow/method | pending user selection/configuration |
| App associated with customer flow | pending |
| Exact issuer/discovery URL | not supplied; no tenant-specific discovery request performed |
| Real authorize/token/JWKS/logout URLs and allowed origins | not verified |
| RS256/client_secret_post compatibility of this tenant | implementation contract exists; actual metadata review pending |
| Callback/logout registration | not registered/verified in this milestone |
| Confidential credential | user-controlled setup pending; no value requested/generated/installed |
| Approved real development customer identity | not supplied/verified |

## Callback decision

Source confirms `@Controller('bff')`, GET auth/callback, default BFF_HOST=127.0.0.1 and BFF_PORT=3200. The existing proposed literal-IP callback is `http://127.0.0.1:3200/bff/auth/callback`. Microsoft currently documents a manifest requirement for registering HTTP 127.0.0.1 instead of using the portal redirect textbox, while supporting HTTP localhost for local development. See [Microsoft redirect rules](https://learn.microsoft.com/en-us/entra/identity-platform/reply-url).

An explicit localhost alternative is `http://localhost:3200/bff/auth/callback`, with browser Console `http://localhost:4200`, public BFF URL `http://localhost:3200`, allowed frontend origin `http://localhost:4200` and post-logout `http://localhost:4200/login`. Keep the underlying listener on the reviewed loopback interface and confirm name resolution. Callback registration, host-only binding/session cookies and browser origin must use the selected profile consistently. No running protected configuration was switched, and no portal acceptance is claimed. The live-auth report records the separately exercised local profiles; real registration remains pending for both.

## Verified Microsoft instructions versus required user actions

Current official pages were checked for [customer tenant creation](https://learn.microsoft.com/en-us/entra/external-id/customers/how-to-create-external-tenant-portal), [Web app registration](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app), [customer flow creation](https://learn.microsoft.com/en-us/entra/external-id/customers/how-to-user-flow-sign-up-sign-in-customers), application association and [OIDC metadata/logout](https://learn.microsoft.com/en-us/entra/identity-platform/v2-protocols-oidc). Customer external tenants are distinct from workforce common/organizations and old B2C policy authorities. These documents verify instructions, not the user's external account resources.

The [updated LogHub setup guide](docs/auth/MICROSOFT_ENTRA_EXTERNAL_ID_SETUP.md#feature-001e--current-user-controlled-setup-handoff) is the concrete manual handoff: check/reuse an existing external tenant/application first; otherwise the account owner explicitly creates the development tenant and Web registration, chooses/associates the supported flow, registers one consistent callback/logout profile, privately configures its confidential development credential and supplies only public metadata/IDs for review. Suggested app name is Skyra LogHub — Development BFF; it is a proposal, not a created resource.

No Microsoft administration connector was available, no authenticated portal was opened, and no account resource was created or modified. Creating tenant/app/credential/flow/customer account requires the user's control or separate specific authorization; the task expressly withholds blanket consent. No provider comparison or unrelated feature work was performed.

## Readiness after public configuration is supplied

Validate the supplied tenant-specific HTTPS discovery document without credentials. Check exact issuer (including possible named-authority versus GUID-issuer host), directory ID, registered client ID, endpoint origins, code/RS256/client_secret_post contract and logout registration. Never widen origin/algorithm trust to force compatibility. Keep credentials in server-only approved secret transport; no real environment template was installed. The current process-local session/pending-state maps remain unsuitable for production scaling; TLS/reverse-proxy/shared-store decisions are documented in the guide.

Real metadata, browser login and real-provider organization E2E remain **NOT RUN — REAL PROVIDER REQUIRED**. Local synthetic/security results are separate. Protected schema/runtime Approval A, real owner/bootstrap Approval B and authoritative activation Approval C all remain NOT AUTHORIZED — AWAITING EXPLICIT HUMAN APPROVAL. No protected database connection or mutation was performed in E.
