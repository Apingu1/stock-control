-- db/init/phase-b_roles_permissions.sql
-- Phase B: Roles + Permissions scaffold (idempotent)
-- Keep users.role as string, but enforce it via FK to roles.name

BEGIN;

-- 1) Roles
CREATE TABLE IF NOT EXISTS roles (
  name TEXT PRIMARY KEY,
  description TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed baseline roles (must exist before FK is added)
INSERT INTO roles (name, description, is_active)
VALUES
  ('OPERATOR', 'Default operator role', TRUE),
  ('SENIOR',   'QA / Senior Operator', TRUE),
  ('ADMIN',    'System administrator', TRUE)
ON CONFLICT (name) DO NOTHING;

-- 2) Permissions (simple string keys)
CREATE TABLE IF NOT EXISTS permissions (
  key TEXT PRIMARY KEY,
  description TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Base permissions you listed
INSERT INTO permissions (key, description) VALUES
  ('materials.view',  'View materials'),
  ('materials.create','Create materials'),
  ('materials.edit',  'Edit materials'),
  ('materials.delete','Delete materials'),

  ('receipts.view',   'View goods receipts'),
  ('receipts.create', 'Create goods receipts'),
  ('receipts.edit',   'Edit goods receipts'),
  ('receipts.delete', 'Delete goods receipts'),

  ('issues.view',     'View consumption (issues)'),
  ('issues.create',   'Create consumption (issues)'),
  ('issues.edit',     'Edit consumption (issues)'),
  ('issues.delete',   'Delete consumption (issues)'),

  ('lots.view',       'View live lots'),
  ('lots.status_change','Change lot status'),

  ('admin.full',      'Full access to Users & Roles admin')
ON CONFLICT (key) DO NOTHING;

-- 3) Role ↔ Permission mapping
CREATE TABLE IF NOT EXISTS role_permissions (
  role_name TEXT NOT NULL REFERENCES roles(name) ON DELETE CASCADE,
  permission_key TEXT NOT NULL REFERENCES permissions(key) ON DELETE CASCADE,
  granted BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (role_name, permission_key)
);

-- Defaults:
-- ADMIN: everything
INSERT INTO role_permissions (role_name, permission_key, granted)
SELECT 'ADMIN', p.key, TRUE
FROM permissions p
ON CONFLICT (role_name, permission_key) DO NOTHING;

-- SENIOR: view/create everywhere, edit/delete for business ops, can change lot status
INSERT INTO role_permissions (role_name, permission_key, granted) VALUES
  ('SENIOR','materials.view',TRUE),
  ('SENIOR','materials.create',TRUE),
  ('SENIOR','materials.edit',TRUE),
  ('SENIOR','materials.delete',FALSE),

  ('SENIOR','receipts.view',TRUE),
  ('SENIOR','receipts.create',TRUE),
  ('SENIOR','receipts.edit',TRUE),
  ('SENIOR','receipts.delete',FALSE),

  ('SENIOR','issues.view',TRUE),
  ('SENIOR','issues.create',TRUE),
  ('SENIOR','issues.edit',TRUE),
  ('SENIOR','issues.delete',FALSE),

  ('SENIOR','lots.view',TRUE),
  ('SENIOR','lots.status_change',TRUE),

  ('SENIOR','admin.full',FALSE)
ON CONFLICT (role_name, permission_key) DO NOTHING;

-- OPERATOR: view + create (no edits/deletes), can view lots but NOT change status
INSERT INTO role_permissions (role_name, permission_key, granted) VALUES
  ('OPERATOR','materials.view',TRUE),
  ('OPERATOR','materials.create',TRUE),
  ('OPERATOR','materials.edit',FALSE),
  ('OPERATOR','materials.delete',FALSE),

  ('OPERATOR','receipts.view',TRUE),
  ('OPERATOR','receipts.create',TRUE),
  ('OPERATOR','receipts.edit',FALSE),
  ('OPERATOR','receipts.delete',FALSE),

  ('OPERATOR','issues.view',TRUE),
  ('OPERATOR','issues.create',TRUE),
  ('OPERATOR','issues.edit',FALSE),
  ('OPERATOR','issues.delete',FALSE),

  ('OPERATOR','lots.view',TRUE),
  ('OPERATOR','lots.status_change',FALSE),

  ('OPERATOR','admin.full',FALSE)
ON CONFLICT (role_name, permission_key) DO NOTHING;

-- 4) Enforce users.role → roles.name (only after roles seeded)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_users_role_roles'
  ) THEN
    -- Ensure the column type is compatible (TEXT recommended)
    -- If your users.role is already TEXT/VARCHAR, this is fine.
    ALTER TABLE users
      ADD CONSTRAINT fk_users_role_roles
      FOREIGN KEY (role) REFERENCES roles(name);
  END IF;
END $$;

COMMIT;
