-- 100_expiry_threshold_settings.sql
-- Phase D3: Admin-configurable expiry auto-quarantine thresholds
-- Aligned to backend model: ExpiryThresholdSetting
-- SAFE: additive only, idempotent

CREATE TABLE IF NOT EXISTS expiry_threshold_settings (
    id SERIAL PRIMARY KEY,
    category_code TEXT NOT NULL,
    type_code TEXT NOT NULL,
    threshold_days INTEGER NOT NULL CHECK (threshold_days >= 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by TEXT NULL,
    CONSTRAINT uq_expiry_threshold_settings UNIQUE (category_code, type_code)
);

-- Seed defaults (idempotent, matches authoritative matrix)
INSERT INTO expiry_threshold_settings (
    category_code,
    type_code,
    threshold_days,
    is_active,
    updated_by
)
VALUES
    -- Solid Raw Mat
    ('SOLID_RAW_MAT', 'API', 1, TRUE, 'seed'),
    ('SOLID_RAW_MAT', 'EXCIPIENT', 1, TRUE, 'seed'),

    -- Liquid Raw Mat
    ('LIQUID_RAW_MAT', 'LICENSED FP', 30, TRUE, 'seed'),
    ('LIQUID_RAW_MAT', 'API', 30, TRUE, 'seed'),
    ('LIQUID_RAW_MAT', 'EXCIPIENT', 1, TRUE, 'seed'),

    -- Tablets / Capsules
    ('TABLETS_CAPSULES', 'LICENSED FP', 30, TRUE, 'seed'),

    -- Creams / Ointments
    ('CREAMS_OINTMENTS', 'LICENSED FP', 30, TRUE, 'seed'),
    ('CREAMS_OINTMENTS', 'EXCIPIENT', 30, TRUE, 'seed'),

    -- Ampoules
    ('AMPOULES', 'LICENSED FP', 30, TRUE, 'seed'),
    ('AMPOULES', 'API', 30, TRUE, 'seed'),
    ('AMPOULES', 'EXCIPIENT', 30, TRUE, 'seed'),

    -- Packaging
    ('PACKAGING', 'PACKAGING', 1, TRUE, 'seed')

ON CONFLICT (category_code, type_code)
DO UPDATE SET
    threshold_days = EXCLUDED.threshold_days,
    is_active = EXCLUDED.is_active,
    updated_at = NOW(),
    updated_by = 'seed';
