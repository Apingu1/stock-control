BEGIN;

-- 1) Add snapshot column for material lot status at time of transaction
ALTER TABLE stock_transactions
  ADD COLUMN IF NOT EXISTS material_status_at_txn TEXT NULL;

-- 2) Backfill existing ISSUE rows best-effort using CURRENT lot status
--    (historical “as-was” can’t be recovered for old data unless it was stored at the time)
UPDATE stock_transactions st
SET material_status_at_txn = ml.status
FROM material_lots ml
WHERE st.material_lot_id = ml.id
  AND st.txn_type = 'ISSUE'
  AND st.material_status_at_txn IS NULL;

COMMIT;
