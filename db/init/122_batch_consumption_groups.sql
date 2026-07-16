-- db/init/122_batch_consumption_groups.sql
--
-- Additive support for one consumption submission containing multiple material
-- issue rows. Existing ISSUE and RECEIPT rows remain valid because every new
-- column is nullable.

BEGIN;

ALTER TABLE IF EXISTS stock_transactions
  ADD COLUMN IF NOT EXISTS consumption_group_id VARCHAR(36),
  ADD COLUMN IF NOT EXISTS pack_size_value NUMERIC(18,6),
  ADD COLUMN IF NOT EXISTS pack_size_uom VARCHAR(50),
  ADD COLUMN IF NOT EXISTS pack_quantity INTEGER;

CREATE INDEX IF NOT EXISTS idx_stock_transactions_consumption_group
  ON stock_transactions (consumption_group_id)
  WHERE consumption_group_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ck_stock_transactions_pack_size_positive'
  ) THEN
    ALTER TABLE stock_transactions
      ADD CONSTRAINT ck_stock_transactions_pack_size_positive
      CHECK (pack_size_value IS NULL OR pack_size_value > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ck_stock_transactions_pack_quantity_positive'
  ) THEN
    ALTER TABLE stock_transactions
      ADD CONSTRAINT ck_stock_transactions_pack_quantity_positive
      CHECK (pack_quantity IS NULL OR pack_quantity > 0);
  END IF;
END $$;

COMMIT;
