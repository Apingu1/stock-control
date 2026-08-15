-- db/init/128_consumption_packaging_lines.sql
--
-- Distinguish formula-material and variable-packaging issues within one atomic
-- consumption batch. Historical and legacy issue rows remain MATERIAL.

BEGIN;

ALTER TABLE stock_transactions
  ADD COLUMN IF NOT EXISTS consumption_line_type VARCHAR(20) NOT NULL DEFAULT 'MATERIAL';

UPDATE stock_transactions
SET consumption_line_type = 'MATERIAL'
WHERE consumption_line_type IS NULL
   OR consumption_line_type NOT IN ('MATERIAL', 'PACKAGING');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ck_stock_transactions_consumption_line_type'
      AND conrelid = 'stock_transactions'::regclass
  ) THEN
    ALTER TABLE stock_transactions
      ADD CONSTRAINT ck_stock_transactions_consumption_line_type
      CHECK (consumption_line_type IN ('MATERIAL', 'PACKAGING'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_stock_transactions_group_line_type
  ON stock_transactions (consumption_group_id, consumption_line_type)
  WHERE txn_type = 'ISSUE' AND consumption_group_id IS NOT NULL;

COMMENT ON COLUMN stock_transactions.consumption_line_type IS
  'MATERIAL participates in product compliance; PACKAGING is variable batch packaging.';

-- Append the classification to the existing analytics read model without
-- changing any established column name or ordering.
CREATE OR REPLACE VIEW analytics_batch_materials AS
SELECT
  st.id AS stock_txn_id,
  st.created_at,
  st.created_by,
  st.es_product_code,
  st.product_batch_no,
  m.material_code,
  m.name AS material_name,
  ml.lot_number,
  st.qty,
  st.uom_code,
  st.unit_price,
  st.total_value,
  st.material_lot_id,
  st.consumption_line_type
FROM stock_transactions st
JOIN material_lots ml ON ml.id = st.material_lot_id
JOIN materials m ON m.id = ml.material_id
WHERE st.txn_type = 'ISSUE'
  AND st.product_batch_no IS NOT NULL;

COMMIT;
