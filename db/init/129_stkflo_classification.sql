-- Enforce the agreed StkFlo material category/type matrix.
-- Existing test data is not silently reassigned or destroyed.
BEGIN;

INSERT INTO material_types (code, name) VALUES ('NA', 'Not Applicable (system and packaging)')
ON CONFLICT (code) DO NOTHING;
INSERT INTO uoms (code, description) VALUES ('AMP', 'Ampoule'), ('UNIT', 'Units')
ON CONFLICT (code) DO NOTHING;

UPDATE materials
SET category_code = 'NA', type_code = 'NA', base_uom_code = 'NA'
WHERE is_cancelled_bmr_marker = TRUE;
UPDATE materials SET type_code = 'NA' WHERE category_code = 'PACKAGING' AND type_code = 'PACKAGING';

DELETE FROM expiry_threshold_settings WHERE category_code = 'PACKAGING' AND type_code = 'PACKAGING';
INSERT INTO expiry_threshold_settings (category_code, type_code, threshold_days, is_active, updated_by)
VALUES ('PACKAGING', 'NA', 1, TRUE, 'system')
ON CONFLICT (category_code, type_code) DO UPDATE
  SET threshold_days = EXCLUDED.threshold_days, is_active = TRUE, updated_by = 'system', updated_at = NOW();

-- Reject new or changed invalid rows even if old test records require manual cleanup.
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
       OR (category_code = 'PACKAGING' AND type_code = 'NA')))
) NOT VALID;

-- Unused legacy lookup entries can safely be removed; referenced test records
-- are never deleted as a side effect of deployment.
DELETE FROM material_types mt WHERE mt.code IN ('OTHER','PACKAGING','Licensed FP')
  AND NOT EXISTS (SELECT 1 FROM materials m WHERE m.type_code = mt.code);
DELETE FROM material_categories mc WHERE mc.code = 'OTHER'
  AND NOT EXISTS (SELECT 1 FROM materials m WHERE m.category_code = mc.code);
DELETE FROM uoms u WHERE u.code = 'KG'
  AND NOT EXISTS (SELECT 1 FROM materials m WHERE m.base_uom_code = u.code);

-- Preserve compatibility for legacy consumers of the balance-view alias.
CREATE OR REPLACE VIEW v_lot_balances AS SELECT * FROM lot_balances_view;
COMMIT;
