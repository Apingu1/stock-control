-- db/init/112_alert_actions.sql
-- Phase D4+: Persist alert actions server-side (idempotent)
-- Creates table + adds permissions alerts.view + alerts.manage

BEGIN;

-- 1) Table
CREATE TABLE IF NOT EXISTS alert_actions (
  id BIGSERIAL PRIMARY KEY,

  alert_key TEXT NOT NULL UNIQUE,               -- e.g. LOW_STOCK::MAT001 / LOW_EXPIRY::MAT001::LOT123
  alert_type TEXT NOT NULL,                     -- LOW_STOCK / LOW_EXPIRY
  material_code TEXT NOT NULL,                  -- material_code for quick join/filter
  lot_number TEXT NULL,                         -- only for LOW_EXPIRY

  state TEXT NOT NULL,                          -- NEW/ACKNOWLEDGED/ON_ORDER/DELAYED/UNAVAILABLE/NOT_REQUIRED
  eta_text TEXT NULL,                           -- user-entered text
  last_seen_available_qty NUMERIC(18,6) NULL,   -- optional (useful for low stock)

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT NULL
);

-- 2) Constraints (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_alert_actions_alert_type'
  ) THEN
    ALTER TABLE alert_actions
      ADD CONSTRAINT ck_alert_actions_alert_type
      CHECK (alert_type IN ('LOW_STOCK','LOW_EXPIRY'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_alert_actions_state'
  ) THEN
    ALTER TABLE alert_actions
      ADD CONSTRAINT ck_alert_actions_state
      CHECK (state IN ('NEW','ACKNOWLEDGED','ON_ORDER','DELAYED','UNAVAILABLE','NOT_REQUIRED'));
  END IF;
END $$;

-- 3) Helpful indexes
CREATE INDEX IF NOT EXISTS ix_alert_actions_material_code ON alert_actions(material_code);
CREATE INDEX IF NOT EXISTS ix_alert_actions_type_state ON alert_actions(alert_type, state);

-- 4) Permissions (additive)
-- Ensure permissions table exists (Phase B should have created it)
INSERT INTO permissions (key, description)
VALUES
  ('alerts.view',   'View low stock / low expiry alerts'),
  ('alerts.manage', 'Update alert status (ack/order/delay/unavailable/not-required)')
ON CONFLICT (key) DO NOTHING;

-- 5) Default grants
-- ADMIN: everything already gets all perms in your Phase B seed,
-- but we still do this defensively in case permissions were added later.
INSERT INTO role_permissions (role_name, permission_key, granted)
VALUES
  ('ADMIN','alerts.view',TRUE),
  ('ADMIN','alerts.manage',TRUE)
ON CONFLICT (role_name, permission_key) DO NOTHING;

-- SENIOR: view + manage
INSERT INTO role_permissions (role_name, permission_key, granted)
VALUES
  ('SENIOR','alerts.view',TRUE),
  ('SENIOR','alerts.manage',TRUE)
ON CONFLICT (role_name, permission_key) DO NOTHING;

-- OPERATOR: view only (no manage)
INSERT INTO role_permissions (role_name, permission_key, granted)
VALUES
  ('OPERATOR','alerts.view',TRUE),
  ('OPERATOR','alerts.manage',FALSE)
ON CONFLICT (role_name, permission_key) DO NOTHING;

COMMIT;
