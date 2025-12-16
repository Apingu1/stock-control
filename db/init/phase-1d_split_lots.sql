-- Phase-1d: Split-lot support (status segments)
-- Allows same (material_id, lot_number) multiple times (one per status segment).
-- Also creates status change log + upgrades lot_balances_view.

BEGIN;

-- 1) Relax unique constraint(s) to allow multiple rows for same (material_id, lot_number)
-- Your environment previously had: material_lots_material_id_lot_number_key
-- Older scripts may have used: uq_material_lots_material_lot_number
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'material_lots_material_id_lot_number_key'
  ) THEN
    ALTER TABLE material_lots
      DROP CONSTRAINT material_lots_material_id_lot_number_key;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'uq_material_lots_material_lot_number'
  ) THEN
    ALTER TABLE material_lots
      DROP CONSTRAINT uq_material_lots_material_lot_number;
  END IF;
END $$;

-- Replace with uniqueness per status segment
-- This allows: same printed lot number, but different status rows (AVAILABLE/QUARANTINE/REJECTED)
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

-- 2) Status change log (for last_reason / audit trail later)
CREATE TABLE IF NOT EXISTS lot_status_changes (
  id              SERIAL PRIMARY KEY,
  material_lot_id INTEGER NOT NULL REFERENCES material_lots(id) ON DELETE CASCADE,
  from_status     VARCHAR(20) NOT NULL,
  to_status       VARCHAR(20) NOT NULL,
  qty_moved       NUMERIC NOT NULL,
  reason          TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      TEXT
);

-- 3) Upgrade lot_balances_view to include last reason + last changed at
CREATE OR REPLACE VIEW lot_balances_view AS
WITH latest_status_change AS (
  SELECT DISTINCT ON (lsc.material_lot_id)
    lsc.material_lot_id,
    lsc.reason AS last_status_reason,
    lsc.created_at AS last_status_changed_at
  FROM lot_status_changes lsc
  ORDER BY lsc.material_lot_id, lsc.created_at DESC
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
