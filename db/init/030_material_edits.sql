BEGIN;

CREATE TABLE IF NOT EXISTS material_edits (
  id BIGSERIAL PRIMARY KEY,
  material_id BIGINT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  edited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  edited_by TEXT NULL,
  edit_reason TEXT NOT NULL,
  before_json TEXT NOT NULL,
  after_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_material_edits_material_id ON material_edits(material_id);
CREATE INDEX IF NOT EXISTS ix_material_edits_edited_at ON material_edits(edited_at);

COMMIT;
