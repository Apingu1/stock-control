-- Phase-1b: material lots + stock transactions (GRN, issues, adjustments)

CREATE TABLE IF NOT EXISTS material_lots (
    id              SERIAL PRIMARY KEY,
    material_id     INTEGER NOT NULL REFERENCES materials(id),
    lot_number      VARCHAR(100) NOT NULL,
    expiry_date     DATE,
    status          VARCHAR(20) NOT NULL DEFAULT 'QUARANTINE',  -- QUARANTINE / RELEASED / REJECTED
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by      TEXT,
    UNIQUE (material_id, lot_number)
);

CREATE TABLE IF NOT EXISTS stock_transactions (
    id              SERIAL PRIMARY KEY,
    material_lot_id INTEGER NOT NULL REFERENCES material_lots(id),
    txn_type        VARCHAR(20) NOT NULL,   -- RECEIPT / ISSUE / ADJUST / RETURN
    qty             NUMERIC(18, 3) NOT NULL,
    uom_code        VARCHAR(20) NOT NULL REFERENCES uoms(code),
    direction       SMALLINT NOT NULL,      -- +1 for in, -1 for out
    unit_price      NUMERIC(18, 4),
    total_value     NUMERIC(18, 4),
    target_ref      TEXT,                   -- e.g. ES batch no., GRN no.
    comment         TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by      TEXT NOT NULL
);

-- View: per-lot on-hand balance
CREATE OR REPLACE VIEW v_lot_balances AS
SELECT
    ml.id          AS material_lot_id,
    ml.material_id AS material_id,
    ml.lot_number  AS lot_number,
    ml.expiry_date AS expiry_date,
    ml.status      AS status,
    COALESCE(SUM(st.qty * st.direction), 0) AS balance_qty,
    MAX(st.uom_code) AS uom_code
FROM material_lots ml
LEFT JOIN stock_transactions st
    ON st.material_lot_id = ml.id
GROUP BY
    ml.id,
    ml.material_id,
    ml.lot_number,
    ml.expiry_date,
    ml.status;
