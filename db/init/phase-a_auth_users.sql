-- db/phase-a_auth_users.sql
-- Phase A — Users / Auth foundation

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'OPERATOR',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by VARCHAR(100) NULL
);

-- Optional: small guard on roles (keeps DB clean)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'ck_users_role_valid'
    ) THEN
        ALTER TABLE users
        ADD CONSTRAINT ck_users_role_valid
        CHECK (role IN ('OPERATOR','SENIOR','ADMIN'));
    END IF;
END$$;

-- Seed initial admin user if it doesn't exist.
-- Password is set later using the admin endpoint or by manually hashing.
-- We seed with a placeholder hash and force change by setting your own immediately.
INSERT INTO users (username, password_hash, role, is_active, created_by)
SELECT 'admin', '$2b$12$C9l2o1mE0pXr7QkYQeO3A.0NwVb0hXG3k7G0b0xG0b0xG0b0xG0b0', 'ADMIN', TRUE, 'system'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'admin');
