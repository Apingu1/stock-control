-- Phase-1 Stock Control schema: Materials master + lookups

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

-- Seed lookups

INSERT INTO material_categories (code, name) VALUES
    ('SOLID_RAW_MAT',      'Solid Raw Mat'),
    ('LIQUID_RAW_MAT',     'Liquid Raw Mat'),
    ('TABLETS_CAPSULES',   'Tablets/Capsules'),
    ('CREAMS_OINTMENTS',   'Creams/Ointments'),
    ('AMPOULES',           'Ampoules'),
    ('NA',                 'Not Applicable')
ON CONFLICT (code) DO NOTHING;

INSERT INTO material_types (code, name) VALUES
    ('API',       'Active Pharmaceutical Ingredient'),
    ('EXCIPIENT', 'Excipient'),
    ('OTHER',     'Other')
ON CONFLICT (code) DO NOTHING;

INSERT INTO uoms (code, description) VALUES
    ('G',    'Gram'),
    ('MG',   'Milligram'),
    ('ML',   'Millilitre'),
    ('L',    'Litre'),
    ('TAB',  'Tablet'),
    ('CAP',  'Capsule'),
    ('NA',   'Not Applicable')
ON CONFLICT (code) DO NOTHING;
