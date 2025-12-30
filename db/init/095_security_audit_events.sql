BEGIN;

CREATE TABLE IF NOT EXISTS security_audit_events (
  id BIGSERIAL PRIMARY KEY,
  event_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  event_type TEXT NOT NULL,            -- e.g. LOGIN_SUCCESS, LOGIN_FAIL, USER_UPDATE, ROLE_PERMS_UPDATE
  actor_username TEXT NULL,            -- who performed the action (or attempted login user)
  actor_role TEXT NULL,
  target_type TEXT NULL,               -- USER / ROLE / PERMISSION_MATRIX / AUTH
  target_ref TEXT NULL,                -- e.g. username, role name
  reason TEXT NULL,                    -- optional (for admin changes you can require)
  success BOOLEAN NULL,                -- useful for login attempts
  ip_address TEXT NULL,
  user_agent TEXT NULL,
  meta_json JSONB NULL                 -- any extra context
);

CREATE INDEX IF NOT EXISTS ix_security_audit_events_event_at
  ON security_audit_events(event_at DESC);

CREATE INDEX IF NOT EXISTS ix_security_audit_events_event_type
  ON security_audit_events(event_type);

CREATE INDEX IF NOT EXISTS ix_security_audit_events_actor
  ON security_audit_events(actor_username);

COMMIT;
