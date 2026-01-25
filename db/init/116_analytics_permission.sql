-- db/init/116_analytics_permission.sql
-- Adds analytics.view permission + default grants (idempotent)

BEGIN;

INSERT INTO permissions (key, description) VALUES
  ('analytics.view','View analytics dashboards and drilldowns')
ON CONFLICT (key) DO NOTHING;

-- ADMIN gets everything automatically, but be explicit for robustness
INSERT INTO role_permissions (role_name, permission_key, granted)
VALUES ('ADMIN','analytics.view',TRUE)
ON CONFLICT (role_name, permission_key) DO NOTHING;

-- Default allow for SENIOR/OPERATOR (can be adjusted in Admin UI)
INSERT INTO role_permissions (role_name, permission_key, granted)
VALUES
  ('SENIOR','analytics.view',TRUE),
  ('OPERATOR','analytics.view',TRUE)
ON CONFLICT (role_name, permission_key) DO NOTHING;

COMMIT;
