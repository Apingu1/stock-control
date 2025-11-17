-- Phase-1 Stock Control schema: Materials, lookups, lots, and stock transactions

-- Lookups ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS material_categories (
    code        VARCHAR(50) PRIMARY KEY,
    name        VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS material_types (
    code        VARCHAR(20) PRIMARY KEY,
    name        VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS uoms (
    code        VARCHAR(20) PRIMARY KEY,
    description VARCHAR(100) NOT NULL
);

-- Materials master ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS materials (
    id                      SERIAL PRIMARY KEY,
    material_code           VARCHAR(50) NOT NULL UNIQUE,
    name                    TEXT NOT NULL,
    category_code           VARCHAR(50) NOT NULL REFERENCES material_categories(code),
    type_code               VARCHAR(20) NOT NULL REFERENCES material_types(code),
    base_uom_code           VARCHAR(20) NOT NULL REFERENCES uoms(code),
    manufacturer            TEXT,
    supplier                TEXT,
    complies_es_criteria    BOOLEAN NOT NULL DEFAULT TRUE,
    status                  VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by              TEXT,
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed lookups (idempotent) ---------------------------------------------------

INSERT INTO material_categories (code, name) VALUES
    ('SOLID_RAW_MAT',      'Solid Raw Mat'),
    ('LIQUID_RAW_MAT',     'Liquid Raw Mat'),
    ('TABLETS_CAPSULES',   'Tablets/Capsules'),
    ('CREAMS_OINTMENTS',   'Creams/Ointments'),
    ('AMPOULES',           'Ampoules'),
    ('PACKAGING',          'Packaging Materials'),
    ('OTHER',              'OTHER')
ON CONFLICT (code) DO NOTHING;

INSERT INTO material_types (code, name) VALUES
    ('API',       'Active Pharmaceutical Ingredient'),
    ('EXCIPIENT', 'Excipient'),
    ('PACKAGING', 'Packaging'),
    ('OTHER',     'Other')
ON CONFLICT (code) DO NOTHING;

INSERT INTO uoms (code, description) VALUES
    ('G',    'Gram'),
    ('MG',   'Milligram'),
    ('ML',   'Millilitre'),
    ('TAB',  'Tablet'),
    ('CAP',  'Capsule'),
    ('NA',   'Not Applicable')
ON CONFLICT (code) DO NOTHING;

-- Material lots ---------------------------------------------------------------

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

-- Stock transactions (ledger) -------------------------------------------------

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

-- View: per-lot balance -------------------------------------------------------

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
