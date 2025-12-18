-- Phase-1d: Split-lot support (status segments)
-- Enforces uniqueness per (material_id, lot_number, status)
-- Updates lot_balances_view to use lot_status_changes.changed_at (not created_at)

BEGIN;

-- 1) Drop old unique constraints that block split-lots
DO $$
BEGIN
  -- older name seen in your DB error logs previously
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'material_lots_material_id_lot_number_key'
  ) THEN
    ALTER TABLE material_lots
      DROP CONSTRAINT material_lots_material_id_lot_number_key;
  END IF;

  -- older script name
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_material_lots_material_lot_number'
  ) THEN
    ALTER TABLE material_lots
      DROP CONSTRAINT uq_material_lots_material_lot_number;
  END IF;
END $$;

-- 2) Add uniqueness guard per status segment
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_material_lots_material_lot_number_status'
  ) THEN
    ALTER TABLE material_lots
      ADD CONSTRAINT uq_material_lots_material_lot_number_status
      UNIQUE (material_id, lot_number, status);
  END IF;
END $$;

-- 3) Update lot_balances_view to include last status reason + last changed at
-- Your lot_status_changes table uses: reason + changed_at
CREATE OR REPLACE VIEW lot_balances_view AS
WITH latest_status_change AS (
  SELECT DISTINCT ON (lsc.material_lot_id)
    lsc.material_lot_id,
    lsc.reason AS last_status_reason,
    lsc.changed_at AS last_status_changed_at
  FROM lot_status_changes lsc
  ORDER BY lsc.material_lot_id, lsc.changed_at DESC
)
SELECT
  ml.id AS material_lot_id,
  m.material_code,
  m.name AS material_name,
  m.category_code,
  m.type_code,
  ml.lot_number,
  ml.expiry_date,
  ml.status,
  ml.manufacturer,
  ml.supplier,
  COALESCE(SUM(st.qty * st.direction::numeric), 0::numeric) AS balance_qty,
  m.base_uom_code AS uom_code,
  lsc.last_status_reason,
  lsc.last_status_changed_at
FROM material_lots ml
JOIN materials m ON ml.material_id = m.id
LEFT JOIN stock_transactions st ON st.material_lot_id = ml.id
LEFT JOIN latest_status_change lsc ON lsc.material_lot_id = ml.id
GROUP BY
  ml.id, m.material_code, m.name, m.category_code, m.type_code,
  ml.lot_number, ml.expiry_date, ml.status, ml.manufacturer, ml.supplier,
  m.base_uom_code, lsc.last_status_reason, lsc.last_status_changed_at;

COMMIT;
