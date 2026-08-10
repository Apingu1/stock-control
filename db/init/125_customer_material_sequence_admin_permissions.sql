-- db/init/125_customer_material_sequence_admin_permissions.sql
-- Additive commercial-deployment data enhancements.
--
-- 1. Server-assigned material codes (MAT0001, MAT0002, ...)
-- 2. Customer name on controlled consumption headers and issue snapshots
-- 3. Repair ADMIN so every currently defined permission is granted
--
-- This migration is deliberately idempotent because the production bootstrap
-- safely re-runs numeric migrations on every deployment start.

BEGIN;

ALTER TABLE IF EXISTS consumption_batches
  ADD COLUMN IF NOT EXISTS customer_name VARCHAR(255);

ALTER TABLE IF EXISTS stock_transactions
  ADD COLUMN IF NOT EXISTS customer_name VARCHAR(255);

-- Keep existing grouped transaction snapshots aligned with their batch header.
UPDATE stock_transactions st
SET customer_name = cb.customer_name
FROM consumption_batches cb
WHERE st.consumption_group_id = cb.consumption_group_id
  AND st.customer_name IS DISTINCT FROM cb.customer_name
  AND cb.customer_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_consumption_batches_customer_name
  ON consumption_batches (customer_name)
  WHERE customer_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_stock_transactions_customer_name
  ON stock_transactions (customer_name)
  WHERE customer_name IS NOT NULL;

CREATE SEQUENCE IF NOT EXISTS material_code_seq
  AS BIGINT
  START WITH 1
  INCREMENT BY 1
  MINVALUE 1
  NO MAXVALUE
  CACHE 1;

-- Move the sequence forward to at least one higher than the largest existing
-- MAT<number> code, without ever moving it backwards after deletions.
DO $$
DECLARE
  max_material_number BIGINT := 0;
  sequence_last BIGINT := 1;
  sequence_called BOOLEAN := FALSE;
  current_next BIGINT := 1;
  required_next BIGINT := 1;
BEGIN
  SELECT COALESCE(
           MAX((substring(material_code FROM '^MAT([0-9]+)$'))::BIGINT),
           0
         )
    INTO max_material_number
  FROM materials
  WHERE material_code ~ '^MAT[0-9]+$';

  SELECT last_value, is_called
    INTO sequence_last, sequence_called
  FROM material_code_seq;

  current_next := CASE
    WHEN sequence_called THEN sequence_last + 1
    ELSE sequence_last
  END;

  required_next := GREATEST(max_material_number + 1, current_next, 1);
  PERFORM setval('material_code_seq', required_next, FALSE);
END $$;

-- Repair all currently registered ADMIN permissions. The application security
-- layer also treats ADMIN as all permissions, making future permission additions
-- safe even before a later migration explicitly inserts the matrix row.
INSERT INTO role_permissions (role_name, permission_key, granted)
SELECT 'ADMIN', p.key, TRUE
FROM permissions p
ON CONFLICT (role_name, permission_key)
DO UPDATE SET granted = TRUE;

COMMIT;
