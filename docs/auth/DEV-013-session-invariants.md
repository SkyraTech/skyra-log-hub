# DEV-013 session architecture and invariants

The baseline BFF stores sessions and pending OIDC transactions in separate Maps. A session holds role/membership snapshots and unused provider tokens. Workspace selection calls the same upsert as login. Guards refresh membership only on selected routes. Restart loses both session and authorization-code transaction state.

Use the existing PostgreSQL installation with a separate, nonowner BFF session role. Runtime configuration requires an explicit session database URL and independent 256-bit encryption key. No database or memory fallback is permitted. Memory exists only through an explicit isolated test factory/configuration.

Browser cookies stay opaque 256-bit random values, HttpOnly, with the existing Secure/SameSite/path policy. Store SHA-256 verifiers, not raw cookies. Persist only encrypted trusted user identity/display fields, CSRF context and selected workspace references. Do not persist provider tokens, roles or membership snapshots. Current Admin membership and resource authorization remain authoritative on every protected route.

Creation is insert-only. Activity is a conditional monotonic update bounded by the original absolute expiry. Workspace changes use optimistic versions and cannot insert. Revocation and rotation serialize on database rows; stale writes cannot restore revoked or expired sessions. Issuing a cookie follows successful durable persistence. An interrupted rotation may require login again but cannot reactivate the old token.

Pending OIDC transactions use a hashed state key and authenticated encryption for nonce, PKCE verifier and browser binding. Issuer/client/callback configuration is bound to each transaction. Consumption is atomic, one-time and short-lived. A callback lost after consumption must restart login; never bypass nonce, PKCE, issuer, audience or signature checks.

Store failures return safe service-unavailable responses, without cached authentication or clearing an otherwise valid browser cookie. Cleanup deletes only expired/revoked session rows and consumed/expired login rows in bounded batches. In-flight operations admitted before logout may finish; logout prevents new authentication and stale writes after its database revocation point.

All migrations, runtime provisioning and fault tests target the independently verified disposable database. Protected PostgreSQL, historical migrations/reports, Platform packages and DEV-012 storage logic remain unchanged.
