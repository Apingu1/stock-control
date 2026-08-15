#!/usr/bin/env bash
set -euo pipefail

: "${DB_NAME:?DB_NAME is required}"
: "${DB_USER:?DB_USER is required}"
: "${DB_PASSWORD:?DB_PASSWORD is required}"
DB_HOST="${DB_HOST:-db}"
DB_PORT="${DB_PORT:-5432}"

export PGPASSWORD="$DB_PASSWORD"
PSQL=(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1)
BOOTSTRAP_VERSION="production-schema-v4-session-security-controls"

marker_exists="$(${PSQL[@]} -tAc "SELECT CASE WHEN to_regclass('public.deployment_schema_bootstrap') IS NULL THEN 0 ELSE 1 END;")"
if [[ "$marker_exists" == "1" ]]; then
  already_applied="$(${PSQL[@]} -tAc "SELECT COUNT(*) FROM deployment_schema_bootstrap WHERE version = '${BOOTSTRAP_VERSION}';")"
  if [[ "$already_applied" == "1" ]]; then
    echo "Database schema bootstrap ${BOOTSTRAP_VERSION} is already applied."
    exit 0
  fi
fi

apply_sql() {
  local filename="$1"
  local path="/sql/${filename}"
  if [[ ! -f "$path" ]]; then
    echo "ERROR: Required SQL file is missing: ${path}"
    exit 1
  fi
  echo ">>> APPLY ${filename}"
  "${PSQL[@]}" -f "$path"
}

echo "Applying Stock Control database schema in controlled order..."
apply_sql "phase-a_auth_users.sql"
apply_sql "phase-1_materials.sql"
apply_sql "phase-1b_lots_and_txn.sql"

"${PSQL[@]}" -c "DROP VIEW IF EXISTS lot_balances_view CASCADE;"
apply_sql "phase-1d_split_lots.sql"
apply_sql "phase-b_roles_permissions.sql"
apply_sql "phase-b_patch_001.sql"
apply_sql "phase-b_patch_002_drop_role_check.sql"

while IFS= read -r path; do
  [[ -n "$path" ]] || continue
  apply_sql "$(basename "$path")"
done < <(find /sql -maxdepth 1 -type f -regextype posix-extended -regex '.*/[0-9]{3}_.*\.sql' | sort)

"${PSQL[@]}" <<SQL
CREATE TABLE IF NOT EXISTS deployment_schema_bootstrap (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO deployment_schema_bootstrap (version)
VALUES ('${BOOTSTRAP_VERSION}')
ON CONFLICT (version) DO NOTHING;
SQL

echo "Database schema bootstrap completed successfully."
