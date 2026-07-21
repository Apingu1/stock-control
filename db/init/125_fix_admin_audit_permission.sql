-- db/init/125_fix_admin_audit_permission.sql
--
-- Repairs existing datasets where migration 098 created audit.view with a
-- FALSE grant for the built-in ADMIN role. The script is deliberately
-- idempotent so it is safe to apply manually and during a clean rebuild.

BEGIN;

INSERT INTO permissions (key, description)
VALUES ('audit.view', 'View audit trail (all events)')
ON CONFLICT (key) DO UPDATE
SET description = EXCLUDED.description;

INSERT INTO role_permissions (role_name, permission_key, granted)
SELECT 'ADMIN', 'audit.view', TRUE
WHERE EXISTS (
  SELECT 1
  FROM roles
  WHERE name = 'ADMIN'
)
ON CONFLICT (role_name, permission_key) DO UPDATE
SET granted = EXCLUDED.granted;

COMMIT;
