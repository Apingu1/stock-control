-- 003_consumption_type.sql
-- Add consumption_type and product_batch_no to stock_transactions

ALTER TABLE stock_transactions
    ADD COLUMN IF NOT EXISTS consumption_type TEXT NOT NULL DEFAULT 'USAGE';

ALTER TABLE stock_transactions
    ADD COLUMN IF NOT EXISTS product_batch_no TEXT;
