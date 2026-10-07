CREATE TABLE IF NOT EXISTS mobile_sessions (
  id BIGSERIAL PRIMARY KEY,
  role VARCHAR(10) NOT NULL CHECK (role IN ('admin','employee')),
  user_id BIGINT NOT NULL,
  access_token_hash CHAR(64) NOT NULL UNIQUE,
  refresh_token_hash CHAR(64) NOT NULL UNIQUE,
  access_expires_at TIMESTAMPTZ NOT NULL,
  refresh_expires_at TIMESTAMPTZ NOT NULL,
  device_name VARCHAR(120),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mobile_sessions_access
  ON mobile_sessions(access_token_hash) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_mobile_sessions_refresh
  ON mobile_sessions(refresh_token_hash) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_mobile_sessions_expiry
  ON mobile_sessions(refresh_expires_at);
