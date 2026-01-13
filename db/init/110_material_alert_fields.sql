-- db/migrations/110_material_alert_fields.sql
-- Phase D4: Material-level alerts + auto-quarantine override fields (additive)

ALTER TABLE materials
  ADD COLUMN IF NOT EXISTS low_stock_threshold_qty NUMERIC(18,6) NULL;

ALTER TABLE materials
  ADD COLUMN IF NOT EXISTS expiry_alert_days INTEGER NULL;

ALTER TABLE materials
  ADD COLUMN IF NOT EXISTS auto_quarantine_override_days INTEGER NULL;

-- Safety checks (idempotent):
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_materials_low_stock_threshold_qty_nonneg'
  ) THEN
    ALTER TABLE materials
      ADD CONSTRAINT ck_materials_low_stock_threshold_qty_nonneg
      CHECK (low_stock_threshold_qty IS NULL OR low_stock_threshold_qty >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_materials_expiry_alert_days_nonneg'
  ) THEN
    ALTER TABLE materials
      ADD CONSTRAINT ck_materials_expiry_alert_days_nonneg
      CHECK (expiry_alert_days IS NULL OR expiry_alert_days >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_materials_auto_quarantine_override_days_nonneg'
  ) THEN
    ALTER TABLE materials
      ADD CONSTRAINT ck_materials_auto_quarantine_override_days_nonneg
      CHECK (auto_quarantine_override_days IS NULL OR auto_quarantine_override_days >= 0);
  END IF;
END$$;
