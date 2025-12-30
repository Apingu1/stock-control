BEGIN;

CREATE TABLE IF NOT EXISTS approved_manufacturer_edits (
  id BIGSERIAL PRIMARY KEY,
  edited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  edited_by TEXT NULL,
  material_code TEXT NOT NULL,
  action TEXT NOT NULL,                 -- ADD / REMOVE
  manufacturer_name TEXT NOT NULL,
  edit_reason TEXT NOT NULL,
  before_json JSONB NULL,
  after_json JSONB NULL
);

CREATE INDEX IF NOT EXISTS ix_approved_manufacturer_edits_material
  ON approved_manufacturer_edits(material_code, edited_at DESC);

COMMIT;
