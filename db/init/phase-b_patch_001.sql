BEGIN;

-- 1) Normalize any existing roles
UPDATE users SET role = UPPER(role) WHERE role IS NOT NULL;

-- 2) Ensure admin permission key exists (keep your existing key)
INSERT INTO permissions (key, description)
VALUES ('admin.full', 'Full access to Users & Roles admin')
ON CONFLICT (key) DO NOTHING;

-- 3) Indexes for fast permission checks
CREATE INDEX IF NOT EXISTS idx_role_permissions_role
  ON role_permissions(role_name);

CREATE INDEX IF NOT EXISTS idx_role_permissions_perm
  ON role_permissions(permission_key);

CREATE INDEX IF NOT EXISTS idx_role_permissions_granted
  ON role_permissions(role_name, granted);

COMMIT;
