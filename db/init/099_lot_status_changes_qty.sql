BEGIN;

ALTER TABLE lot_status_changes
  ADD COLUMN IF NOT EXISTS changed_qty numeric;

ALTER TABLE lot_status_changes
  ADD COLUMN IF NOT EXISTS balance_before numeric;

COMMIT;
