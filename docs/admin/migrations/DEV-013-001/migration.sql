BEGIN;
CREATE TABLE bff_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 token_digest char(64) NOT NULL UNIQUE CHECK (token_digest ~ '^[a-f0-9]{64}$'),
 encrypted_data text NOT NULL CHECK (octet_length(encrypted_data) BETWEEN 32 AND 65536),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 last_activity_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 absolute_expires_at timestamptz NOT NULL,
 idle_expires_at timestamptz NOT NULL,
 version integer NOT NULL DEFAULT 1 CHECK (version > 0),
 revoked_at timestamptz,
 CHECK (created_at <= last_activity_at AND last_activity_at <= absolute_expires_at),
 CHECK (created_at < absolute_expires_at AND idle_expires_at <= absolute_expires_at)
);
CREATE INDEX bff_sessions_expiry_idx ON bff_sessions (LEAST(absolute_expires_at,idle_expires_at),id);
CREATE INDEX bff_sessions_revoked_idx ON bff_sessions (revoked_at,id) WHERE revoked_at IS NOT NULL;
CREATE TABLE bff_login_transactions (
 state_digest char(64) PRIMARY KEY CHECK (state_digest ~ '^[a-f0-9]{64}$'),
 encrypted_data text NOT NULL CHECK (octet_length(encrypted_data) BETWEEN 32 AND 65536),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL,
 consumed_at timestamptz,
 CHECK (expires_at > created_at AND expires_at <= created_at + interval '10 minutes')
);
CREATE INDEX bff_login_expiry_idx ON bff_login_transactions (expires_at,state_digest);
GRANT SELECT,INSERT,UPDATE,DELETE ON bff_sessions,bff_login_transactions TO skyra_bff_sessions_runtime;
COMMIT;
