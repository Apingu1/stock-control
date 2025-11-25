-- Phase-1 Stock Control schema: Materials, lookups, lots, stock transactions,
-- and approved manufacturers for tablets/capsules.

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

-- NEW: Approved manufacturers per material -----------------------------------

CREATE TABLE IF NOT EXISTS material_approved_manufacturers (
    id                  SERIAL PRIMARY KEY,
    material_id         INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
    manufacturer_name   TEXT NOT NULL,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by          TEXT,
    CONSTRAINT uq_material_approved_manu_material_name
        UNIQUE (material_id, manufacturer_name)
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
    status          VARCHAR(20) NOT NULL DEFAULT 'QUARANTINE',  -- QUARANTINE / RELEASED / REJECTED / EXPIRED
    manufacturer    TEXT,
    supplier        TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by      TEXT,
    UNIQUE (material_id, lot_number)
);

-- Stock transactions (ledger) -------------------------------------------------

CREATE TABLE IF NOT EXISTS stock_transactions (
    id                      SERIAL PRIMARY KEY,
    material_lot_id         INTEGER NOT NULL REFERENCES material_lots(id),
    txn_type                TEXT NOT NULL,
    qty                     NUMERIC(18, 3) NOT NULL,
    uom_code                TEXT NOT NULL,
    direction               SMALLINT NOT NULL,
    unit_price              NUMERIC(18, 4),
    total_value             NUMERIC(18, 4),
    target_ref              TEXT,
    product_manufacture_date DATE,
    comment                 TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by              TEXT NOT NULL
);

-- View: per-lot balance -------------------------------------------------------

CREATE OR REPLACE VIEW lot_balances_view AS
WITH latest_status AS (
    SELECT DISTINCT ON (ml.id)
        ml.id AS material_lot_id,
        ml.status,
        ml.created_at AS updated_at
    FROM material_lots ml
    ORDER BY ml.id, ml.created_at DESC
)
SELECT
    ml.id              AS material_lot_id,
    m.material_code,
    m.name             AS material_name,
    ml.lot_number,
    ml.expiry_date,
    ls.status,
    ml.manufacturer,
    ml.supplier,
    COALESCE(SUM(st.qty * st.direction), 0) AS balance_qty,
    m.base_uom_code    AS uom_code
FROM material_lots ml
JOIN materials m ON ml.material_id = m.id
LEFT JOIN latest_status ls ON ls.material_lot_id = ml.id
LEFT JOIN stock_transactions st ON st.material_lot_id = ml.id
GROUP BY
    ml.id,
    m.material_code,
    m.name,
    ml.lot_number,
    ml.expiry_date,
    ls.status,
    ml.manufacturer,
    ml.supplier,
    m.base_uom_code;

-- Approved manufacturers per material
CREATE TABLE IF NOT EXISTS material_approved_manufacturers (
    id              SERIAL PRIMARY KEY,
    material_id     INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
    manufacturer_name VARCHAR(255) NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by      VARCHAR(100)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_material_approved_manufacturer_material_name
ON material_approved_manufacturers (material_id, LOWER(manufacturer_name));


-- Backwards-compatibility wrapper: keep old name v_lot_balances working ------

CREATE OR REPLACE VIEW v_lot_balances AS
SELECT *
FROM lot_balances_view;
