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

COMMIT;
