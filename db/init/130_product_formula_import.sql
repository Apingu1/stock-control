-- Store the full BMR storage instructions, separate from the operational ambient/fridge flag.
ALTER TABLE IF EXISTS products ADD COLUMN IF NOT EXISTS bmr_storage_instructions TEXT NOT NULL DEFAULT '';

-- StkFlo: source-traceable, versioned product formulas and controlled BMR import.
-- This file is idempotent and contains no stock ledger operations.
CREATE TABLE IF NOT EXISTS product_formula_versions (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  version_number VARCHAR(100) NOT NULL,
  formula_basis TEXT NOT NULL DEFAULT '',
  source_bmr_file TEXT NOT NULL DEFAULT '',
  source_document TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by VARCHAR(100) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by VARCHAR(100) NOT NULL,
  CONSTRAINT uq_product_formula_version UNIQUE(product_id,version_number)
);
CREATE INDEX IF NOT EXISTS idx_product_formula_product ON product_formula_versions(product_id);

CREATE TABLE IF NOT EXISTS product_formula_lines (
  id BIGSERIAL PRIMARY KEY,
  formula_version_id BIGINT NOT NULL REFERENCES product_formula_versions(id) ON DELETE RESTRICT,
  material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
  material_sequence INTEGER NOT NULL CHECK (material_sequence > 0),
  source_material_name TEXT NOT NULL DEFAULT '',
  material_strength TEXT NOT NULL DEFAULT '',
  master_formula_raw TEXT NOT NULL DEFAULT '',
  quantity_type TEXT NOT NULL DEFAULT '',
  quantity_value NUMERIC(22,8),
  quantity_unit VARCHAR(50) NOT NULL DEFAULT '',
  qs_target_value NUMERIC(22,8),
  qs_target_unit VARCHAR(50) NOT NULL DEFAULT '',
  conditional_material BOOLEAN NOT NULL DEFAULT FALSE,
  manufacturer_supplier TEXT NOT NULL DEFAULT '',
  section4_table TEXT NOT NULL DEFAULT '',
  section4_row TEXT NOT NULL DEFAULT '',
  CONSTRAINT uq_product_formula_line_seq UNIQUE (formula_version_id, material_sequence)
);
CREATE INDEX IF NOT EXISTS idx_product_formula_lines_material ON product_formula_lines(material_id);

CREATE TABLE IF NOT EXISTS product_bmr_imports (
  id BIGSERIAL PRIMARY KEY,
  source_sha256 VARCHAR(64) NOT NULL UNIQUE,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  imported_by VARCHAR(100) NOT NULL,
  approval_reference TEXT NOT NULL,
  products_created INTEGER NOT NULL,
  formulas_created INTEGER NOT NULL,
  materials_linked INTEGER NOT NULL,
  manifest JSONB NOT NULL
);

INSERT INTO permissions (key, description) VALUES
 ('data_migration.view', 'Data Migration: view, upload and validate import data'),
 ('data_migration.commit', 'Data Migration: approve and execute a controlled import')
ON CONFLICT (key) DO UPDATE SET description=EXCLUDED.description;

INSERT INTO role_permissions(role_name, permission_key, granted)
SELECT r.name,p.key,(r.name='ADMIN')
FROM roles r CROSS JOIN permissions p
WHERE p.key IN ('data_migration.view','data_migration.commit')
ON CONFLICT (role_name,permission_key) DO NOTHING;
UPDATE role_permissions SET granted=TRUE
WHERE role_name='ADMIN' AND permission_key IN ('data_migration.view','data_migration.commit');
