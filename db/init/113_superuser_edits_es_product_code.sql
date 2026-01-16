BEGIN;

-- Phase D5: Superuser edits + ES Product Code
-- 1) New permissions (separate from normal edit)
INSERT INTO permissions (key, description)
VALUES
  ('materials.super_edit_locked_fields', 'Superuser: edit locked material fields (e.g., name)'),
  ('receipts.super_edit_locked_fields',  'Superuser: edit locked receipt/lot fields (e.g., lot number, expiry)'),
  ('issues.super_edit_locked_fields',    'Superuser: edit locked issue fields (reserved; not enabled by default)')
ON CONFLICT (key) DO NOTHING;

-- Ensure every role has these permissions (default = FALSE)
INSERT INTO role_permissions (role_name, permission_key, granted)
SELECT r.name, p.key, FALSE
FROM roles r
CROSS JOIN (
  SELECT 'materials.super_edit_locked_fields' AS key
  UNION ALL SELECT 'receipts.super_edit_locked_fields'
  UNION ALL SELECT 'issues.super_edit_locked_fields'
) p
WHERE NOT EXISTS (
  SELECT 1
  FROM role_permissions rp
  WHERE rp.role_name = r.name
    AND rp.permission_key = p.key
);

-- 2) ES Product Code on stock transactions (issue rows use it, safe for others)
ALTER TABLE stock_transactions
  ADD COLUMN IF NOT EXISTS es_product_code TEXT NULL;

CREATE INDEX IF NOT EXISTS ix_stock_transactions_es_product_code
  ON stock_transactions (es_product_code);

-- 3) Material lot edit audit trail (for superuser lot/expiry corrections + merges)
CREATE TABLE IF NOT EXISTS material_lot_edits (
  id BIGSERIAL PRIMARY KEY,
  edited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  edited_by TEXT NULL,
  material_lot_id BIGINT NOT NULL REFERENCES material_lots(id) ON DELETE RESTRICT,

  action TEXT NOT NULL, -- EDIT / RENAME_MERGE
  edit_reason TEXT NOT NULL,

  before_json JSONB NULL,
  after_json JSONB NULL
);

CREATE INDEX IF NOT EXISTS ix_material_lot_edits_lot_id ON material_lot_edits(material_lot_id);
CREATE INDEX IF NOT EXISTS ix_material_lot_edits_edited_at ON material_lot_edits(edited_at);

COMMIT;
