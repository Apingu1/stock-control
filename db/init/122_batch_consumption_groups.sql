-- db/init/122_batch_consumption_groups.sql
--
-- Additive support for one consumption submission containing multiple material
-- issue rows. Existing ISSUE and RECEIPT rows remain valid because every new
-- column is nullable.

BEGIN;

ALTER TABLE IF EXISTS stock_transactions
  ADD COLUMN IF NOT EXISTS consumption_group_id VARCHAR(36),
  ADD COLUMN IF NOT EXISTS total_batch_size NUMERIC(18,6),
  ADD COLUMN IF NOT EXISTS batch_size_uom VARCHAR(50),
  ADD COLUMN IF NOT EXISTS number_of_units INTEGER;

CREATE INDEX IF NOT EXISTS idx_stock_transactions_consumption_group
  ON stock_transactions (consumption_group_id)
  WHERE consumption_group_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ck_stock_transactions_total_batch_size_positive'
  ) THEN
    ALTER TABLE stock_transactions
      ADD CONSTRAINT ck_stock_transactions_total_batch_size_positive
      CHECK (total_batch_size IS NULL OR total_batch_size > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ck_stock_transactions_number_of_units_positive'
  ) THEN
    ALTER TABLE stock_transactions
      ADD CONSTRAINT ck_stock_transactions_number_of_units_positive
      CHECK (number_of_units IS NULL OR number_of_units > 0);
  END IF;
END $$;

COMMIT;
