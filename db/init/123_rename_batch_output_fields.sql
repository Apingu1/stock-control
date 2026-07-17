-- db/init/123_rename_batch_output_fields.sql
--
-- Preserve data from installations that applied the first version of migration
-- 122, while replacing pack-specific terminology with whole-batch output fields.
-- Fresh installations already receive the new names from migration 122, so
-- every operation below is conditional and safely becomes a no-op.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'stock_transactions'
      AND column_name = 'pack_size_value'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'stock_transactions'
      AND column_name = 'total_batch_size'
  ) THEN
    ALTER TABLE stock_transactions
      RENAME COLUMN pack_size_value TO total_batch_size;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'stock_transactions'
      AND column_name = 'pack_size_uom'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'stock_transactions'
      AND column_name = 'batch_size_uom'
  ) THEN
    ALTER TABLE stock_transactions
      RENAME COLUMN pack_size_uom TO batch_size_uom;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'stock_transactions'
      AND column_name = 'pack_quantity'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'stock_transactions'
      AND column_name = 'number_of_units'
  ) THEN
    ALTER TABLE stock_transactions
      RENAME COLUMN pack_quantity TO number_of_units;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_stock_transactions_pack_size_positive'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_stock_transactions_total_batch_size_positive'
  ) THEN
    ALTER TABLE stock_transactions
      RENAME CONSTRAINT ck_stock_transactions_pack_size_positive
      TO ck_stock_transactions_total_batch_size_positive;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_stock_transactions_pack_quantity_positive'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_stock_transactions_number_of_units_positive'
  ) THEN
    ALTER TABLE stock_transactions
      RENAME CONSTRAINT ck_stock_transactions_pack_quantity_positive
      TO ck_stock_transactions_number_of_units_positive;
  END IF;
END $$;

-- Also support the safe but unusual case where the revised migration 122 was
-- re-run before this migration, leaving both the legacy and replacement names.
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
    UPDATE stock_transactions
    SET total_batch_size = COALESCE(total_batch_size, pack_size_value);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'stock_transactions'
      AND column_name = 'pack_size_uom'
  ) THEN
    UPDATE stock_transactions
    SET batch_size_uom = COALESCE(batch_size_uom, pack_size_uom);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'stock_transactions'
      AND column_name = 'pack_quantity'
  ) THEN
    UPDATE stock_transactions
    SET number_of_units = COALESCE(number_of_units, pack_quantity);
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
