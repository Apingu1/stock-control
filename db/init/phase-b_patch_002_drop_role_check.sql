BEGIN;

-- Allow dynamic roles (remove old fixed-role constraint)
ALTER TABLE users
  DROP CONSTRAINT IF EXISTS ck_users_role_valid;

-- Optional but recommended: avoid role length issues later
ALTER TABLE users
  ALTER COLUMN role TYPE TEXT;

COMMIT;
