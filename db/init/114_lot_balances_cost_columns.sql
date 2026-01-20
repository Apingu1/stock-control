-- 114_lot_balances_cost_columns.sql
-- Ensure lot_balances_view includes costing columns expected by API.
-- Safe to run on fresh or existing DBs.

CREATE OR REPLACE VIEW lot_balances_view AS
WITH latest_status_change AS (
  SELECT DISTINCT ON (lsc.material_lot_id)
    lsc.material_lot_id,
    lsc.reason AS last_status_reason,
    lsc.changed_at AS last_status_changed_at
  FROM lot_status_changes lsc
  ORDER BY lsc.material_lot_id, lsc.changed_at DESC
),
lot_costs AS (
  -- Weighted average unit cost based on receipt (direction=1) transactions.
  SELECT
    st.material_lot_id,
    CASE
      WHEN SUM(CASE WHEN st.direction = 1 AND st.total_value IS NOT NULL THEN st.total_value ELSE 0 END) = 0 THEN NULL
      WHEN SUM(CASE WHEN st.direction = 1 THEN st.qty ELSE 0 END) = 0 THEN NULL
      ELSE
        SUM(CASE WHEN st.direction = 1 AND st.total_value IS NOT NULL THEN st.total_value ELSE 0 END)
        / NULLIF(SUM(CASE WHEN st.direction = 1 THEN st.qty ELSE 0 END), 0)
    END AS lot_unit_price
  FROM stock_transactions st
  GROUP BY st.material_lot_id
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
  lsc.last_status_changed_at,
  lc.lot_unit_price,
  CASE
    WHEN lc.lot_unit_price IS NULL THEN NULL
    ELSE (COALESCE(SUM(st.qty * st.direction::numeric), 0::numeric) * lc.lot_unit_price)
  END AS lot_value
FROM material_lots ml
JOIN materials m ON ml.material_id = m.id
LEFT JOIN stock_transactions st ON st.material_lot_id = ml.id
LEFT JOIN latest_status_change lsc ON lsc.material_lot_id = ml.id
LEFT JOIN lot_costs lc ON lc.material_lot_id = ml.id
GROUP BY
  ml.id, m.material_code, m.name, m.category_code, m.type_code,
  ml.lot_number, ml.expiry_date, ml.status, ml.manufacturer, ml.supplier,
  m.base_uom_code, lsc.last_status_reason, lsc.last_status_changed_at,
  lc.lot_unit_price;
