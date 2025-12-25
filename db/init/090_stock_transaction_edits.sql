BEGIN;

-- Immutable audit trail for edited stock transactions
CREATE TABLE IF NOT EXISTS stock_transaction_edits (
    id BIGSERIAL PRIMARY KEY,
    stock_transaction_id BIGINT NOT NULL
        REFERENCES stock_transactions(id)
        ON DELETE CASCADE,

    edited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    edited_by TEXT NULL,

    -- Mandatory justification for the edit (GMP / data integrity)
    edit_reason TEXT NOT NULL,

    -- JSON snapshots of the transaction before and after edit
    before_json TEXT NOT NULL,
    after_json  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_stock_transaction_edits_txn_id
    ON stock_transaction_edits(stock_transaction_id);

COMMIT;
