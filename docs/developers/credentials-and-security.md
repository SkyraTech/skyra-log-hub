# Managed credential setup

Select your authorized project in the Console, then open Ingestion credentials. The existing service decides permission to list/create/replace/revoke; onboarding grants no capabilities. If Create is unavailable, ask an authorized project or organization administrator. Explorer access is checked independently.

Create a descriptive credential, select only needed environments and set an expiry. The secret is returned once during issuance/rotation. Copy it into a server environment or secret manager; metadata pages cannot reveal it later. Never place it in source, URLs, browser telemetry, browser code, localStorage or sessionStorage. The onboarding snippets contain variable names only and never receive a revealed credential.

Lost key: review metadata, revoke unused/lost credentials, then create a replacement. Rotation produces a new one-time handoff under the existing service rules; deploy the replacement securely and confirm revocation state. A lost issuance response may already have created a credential: inspect request metadata before retrying issuance. Do not assume the secret can be retrieved using an idempotency key.

Gateway authentication is `Authorization: Bearer <managed credential>` over TLS. Project/environment binding is enforced on every batch. Invalid, expired and revoked keys return a generic authentication failure. Avoid logging request headers, environment dumps, fetch exceptions or untrusted response bodies. SDK redaction helps but does not justify logging secrets. In particular, never place a credential in a free-text message.

Local test identities/keys are disposable. No production identity provider, protected database bootstrap, npm publication or deployment is part of this feature. See [quick start](getting-started.md).
