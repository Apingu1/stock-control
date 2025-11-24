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
    manufacturer    text,
    supplier        text,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by      TEXT,
    UNIQUE (material_id, lot_number)
);

-- Stock transactions (ledger) -------------------------------------------------

CREATE TABLE stock_transactions (
    id                      serial PRIMARY KEY,
    material_lot_id         integer NOT NULL REFERENCES material_lots(id),
    txn_type                text NOT NULL,
    qty                     numeric(18, 3) NOT NULL,
    uom_code                text NOT NULL,
    direction               smallint NOT NULL,
    unit_price              numeric(18, 4),
    total_value             numeric(18, 4),
    target_ref              text,
    product_manufacture_date date,          -- <-- NEW COLUMN
    comment                 text,
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              text NOT NULL
);

-- View: per-lot balance -------------------------------------------------------

create or replace view lot_balances_view as
with latest_status as (
    select distinct on (ml.id)
        ml.id as material_lot_id,
        ml.status,
        ml.created_at as updated_at
    from material_lots ml
    order by ml.id, ml.created_at desc
)
select
    ml.id as material_lot_id,
    m.material_code,
    m.name as material_name,
    ml.lot_number,
    ml.expiry_date,
    ls.status,
    ml.manufacturer,
    ml.supplier,
    coalesce(sum(st.qty * st.direction), 0) as balance_qty,
    m.base_uom_code as uom_code
from material_lots ml
join materials m on ml.material_id = m.id
left join latest_status ls on ls.material_lot_id = ml.id
left join stock_transactions st on st.material_lot_id = ml.id
group by
    ml.id,
    m.material_code,
    m.name,
    ml.lot_number,
    ml.expiry_date,
    ls.status,
    ml.manufacturer,
    ml.supplier,
    m.base_uom_code;

-- Backwards-compatibility wrapper: keep old name v_lot_balances working
CREATE OR REPLACE VIEW v_lot_balances AS
SELECT *
FROM lot_balances_view;
