BEGIN;

-- Permission registry
INSERT INTO permissions(key, description)
VALUES ('audit.view', 'View audit trail (all events)')
ON CONFLICT (key) DO NOTHING;

-- Ensure every role has a row for this permission
INSERT INTO role_permissions(role_name, permission_key, granted)
SELECT r.name, 'audit.view', false
FROM roles r
WHERE NOT EXISTS (
  SELECT 1 FROM role_permissions rp
  WHERE rp.role_name = r.name AND rp.permission_key = 'audit.view'
);

-- The built-in ADMIN role is defined as having full system access. Because
-- audit.view is introduced after the Phase B ADMIN defaults are populated, it
-- must be granted explicitly here or a fresh database rebuild leaves the
-- Audit Trail navigation disabled for administrators.
UPDATE role_permissions
SET granted = true
WHERE role_name = 'ADMIN'
  AND permission_key = 'audit.view';

COMMIT;
