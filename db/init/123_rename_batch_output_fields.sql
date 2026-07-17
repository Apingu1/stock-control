-- db/init/123_rename_batch_output_fields.sql
--
-- Replace pack-specific output terminology with whole-batch output fields.
-- Existing data is converted semantically, for example:
--   pack_size_value = 100 mL and pack_quantity = 50
-- becomes:
--   total_batch_size = 5000 mL and number_of_units = 50
--
-- Legacy columns are deliberately retained as an untouched recovery source.
-- The API and UI use only the new fields. Fresh installations already receive
-- the new columns from the revised migration 122, making the copy block a no-op.

BEGIN;

ALTER TABLE IF EXISTS stock_transactions
  ADD COLUMN IF NOT EXISTS total_batch_size NUMERIC(18,6),
  ADD COLUMN IF NOT EXISTS batch_size_uom VARCHAR(50),
  ADD COLUMN IF NOT EXISTS number_of_units INTEGER;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'stock_transactions'
      AND column_name = 'pack_size_value'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'stock_transactions'
        AND column_name = 'pack_quantity'
    ) THEN
      UPDATE stock_transactions
      SET total_batch_size = COALESCE(
        total_batch_size,
        pack_size_value * COALESCE(pack_quantity, 1)
      )
      WHERE pack_size_value IS NOT NULL;
    ELSE
      UPDATE stock_transactions
      SET total_batch_size = COALESCE(total_batch_size, pack_size_value)
      WHERE pack_size_value IS NOT NULL;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'stock_transactions'
      AND column_name = 'pack_size_uom'
  ) THEN
    UPDATE stock_transactions
    SET batch_size_uom = COALESCE(batch_size_uom, pack_size_uom)
    WHERE pack_size_uom IS NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'stock_transactions'
      AND column_name = 'pack_quantity'
  ) THEN
    UPDATE stock_transactions
    SET number_of_units = COALESCE(number_of_units, pack_quantity)
    WHERE pack_quantity IS NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_stock_transactions_total_batch_size_positive'
  ) THEN
    ALTER TABLE stock_transactions
      ADD CONSTRAINT ck_stock_transactions_total_batch_size_positive
      CHECK (total_batch_size IS NULL OR total_batch_size > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_stock_transactions_number_of_units_positive'
  ) THEN
    ALTER TABLE stock_transactions
      ADD CONSTRAINT ck_stock_transactions_number_of_units_positive
      CHECK (number_of_units IS NULL OR number_of_units > 0);
  END IF;
END $$;

CREATE OR REPLACE VIEW analytics_product_batches_cost AS
SELECT
  st.es_product_code,
  st.product_batch_no,
  COALESCE(SUM(st.total_value), 0)::numeric(18,6) AS batch_total_cost,
  COUNT(*) AS issue_txn_count,
  MIN(st.created_at) AS first_issue_at,
  MAX(st.created_at) AS last_issue_at,
  MAX(st.total_batch_size) AS total_batch_size,
  MAX(st.batch_size_uom) AS batch_size_uom,
  MAX(st.number_of_units) AS number_of_units
FROM stock_transactions st
WHERE st.txn_type = 'ISSUE'
  AND st.es_product_code IS NOT NULL
  AND st.product_batch_no IS NOT NULL
GROUP BY st.es_product_code, st.product_batch_no;

COMMIT;
