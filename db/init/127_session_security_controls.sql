BEGIN;

-- Every password created by an administrator is temporary. Existing accounts
-- are deliberately enrolled once when this migration is first applied.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT TRUE;

-- Singleton, dataset-backed setting used by both the API and frontend.
CREATE TABLE IF NOT EXISTS security_session_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  inactivity_timeout_minutes INTEGER NOT NULL DEFAULT 15
    CHECK (inactivity_timeout_minutes BETWEEN 5 AND 120),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by VARCHAR(100) NULL
);

INSERT INTO security_session_settings (id, inactivity_timeout_minutes, updated_by)
VALUES (1, 15, 'system')
ON CONFLICT (id) DO NOTHING;

-- Server-side sessions make the inactivity control authoritative. API polling
-- does not update last_activity_at; only the explicit human-activity endpoint
-- does so.
CREATE TABLE IF NOT EXISTS auth_sessions (
  session_id VARCHAR(64) PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  absolute_expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS ix_auth_sessions_user_id
  ON auth_sessions(user_id);

CREATE INDEX IF NOT EXISTS ix_auth_sessions_active_expiry
  ON auth_sessions(absolute_expires_at)
  WHERE revoked_at IS NULL;

COMMIT;
