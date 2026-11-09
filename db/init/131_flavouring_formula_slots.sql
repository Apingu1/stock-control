-- StkFlo 131: additive flavour category and generic BMR ingredient slots.
-- No existing material, stock lot, receipt, transaction or formula is removed.
BEGIN;

INSERT INTO material_categories(code, name)
VALUES ('FLAVOURING', 'Flavouring')
ON CONFLICT (code) DO NOTHING;

INSERT INTO material_types(code, name)
VALUES ('NA', 'Not Applicable (packaging and flavouring)')
ON CONFLICT (code) DO NOTHING;

INSERT INTO expiry_threshold_settings(category_code, type_code, threshold_days, is_active, updated_by)
VALUES ('FLAVOURING', 'NA', 1, TRUE, 'system')
ON CONFLICT (category_code, type_code) DO UPDATE
  SET threshold_days=EXCLUDED.threshold_days, is_active=TRUE,
      updated_by='system', updated_at=NOW();

-- Rebuild the existing unvalidated check, extending its permitted matrix only.
ALTER TABLE materials DROP CONSTRAINT IF EXISTS ck_stkflo_material_classification;
ALTER TABLE materials ADD CONSTRAINT ck_stkflo_material_classification CHECK (
    (is_cancelled_bmr_marker AND material_code = 'Cancelled BMR'
      AND category_code = 'NA' AND type_code = 'NA' AND base_uom_code = 'NA')
 OR (NOT is_cancelled_bmr_marker AND base_uom_code IN ('G','MG','ML','L','TAB','CAP','AMP','UNIT')
     AND ((category_code = 'SOLID_RAW_MAT' AND type_code IN ('API','EXCIPIENT'))
       OR (category_code = 'LIQUID_RAW_MAT' AND type_code IN ('API','LICENSED FP','EXCIPIENT'))
       OR (category_code = 'TABLETS_CAPSULES' AND type_code = 'LICENSED FP')
       OR (category_code = 'CREAMS_OINTMENTS' AND type_code IN ('LICENSED FP','EXCIPIENT'))
       OR (category_code = 'AMPOULES' AND type_code IN ('API','LICENSED FP','EXCIPIENT'))
       OR (category_code = 'PACKAGING' AND type_code = 'NA')
       OR (category_code = 'FLAVOURING' AND type_code = 'NA')))
) NOT VALID;

ALTER TABLE product_formula_lines
  ADD COLUMN IF NOT EXISTS ingredient_code VARCHAR(32);
ALTER TABLE product_formula_lines ALTER COLUMN material_id DROP NOT NULL;

ALTER TABLE product_formula_lines
  DROP CONSTRAINT IF EXISTS ck_product_formula_ingredient_identity;
ALTER TABLE product_formula_lines
  ADD CONSTRAINT ck_product_formula_ingredient_identity CHECK (
    (material_id IS NOT NULL AND ingredient_code IS NULL)
    OR (material_id IS NULL AND ingredient_code IN ('FLAVOUR_OPTIONAL','FLAVOUR_REQUIRED'))
  ) NOT VALID;

CREATE UNIQUE INDEX IF NOT EXISTS uq_product_formula_generic_flavour
  ON product_formula_lines(formula_version_id)
  WHERE ingredient_code IS NOT NULL;

COMMIT;
