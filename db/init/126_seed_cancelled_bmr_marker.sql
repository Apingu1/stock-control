-- db/init/126_seed_cancelled_bmr_marker.sql
-- Ensure every clean/commercial deployment has the exact zero-stock marker
-- required by the controlled Cancelled BMR workflow.

BEGIN;

INSERT INTO materials (
  material_code,
  name,
  category_code,
  type_code,
  base_uom_code,
  manufacturer,
  supplier,
  complies_es_criteria,
  status,
  created_by
)
VALUES (
  'Cancelled BMR',
  'Cancelled BMR',
  'NA',
  'NA',
  'NA',
  NULL,
  NULL,
  TRUE,
  'ACTIVE',
  'SYSTEM'
)
ON CONFLICT (material_code) DO NOTHING;

UPDATE materials
SET is_cancelled_bmr_marker = TRUE,
    category_code = 'NA', type_code = 'NA', base_uom_code = 'NA',
    updated_at = NOW()
WHERE material_code = 'Cancelled BMR'
  AND name = 'Cancelled BMR';

COMMIT;
