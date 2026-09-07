-- Short-lived access token revocation and rotating refresh token storage.
CREATE TABLE IF NOT EXISTS token_revocations (
    jti TEXT PRIMARY KEY,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_admin_refresh_tokens_admin ON admin_refresh_tokens(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_refresh_tokens_expiry ON admin_refresh_tokens(expires_at);
