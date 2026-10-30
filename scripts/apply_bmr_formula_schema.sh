#!/usr/bin/env bash
set -euo pipefail

# Safely add the BMR formula tables, original BMR storage field and role permissions.
# This deliberately DOES NOT rerun the production bootstrap, drop views,
# reset inventory, create a new database, or remove Docker volumes.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"
SQL_FILE="$ROOT_DIR/db/init/130_product_formula_import.sql"
TARGET="${1:-dev}"

case "$TARGET" in
  dev) COMPOSE_FILE="$ROOT_DIR/infra/docker-compose.yml" ;;
  prodtest) COMPOSE_FILE="$ROOT_DIR/infra/docker-compose.production.yml" ;;
  *) echo "Usage: bash scripts/apply_bmr_formula_schema.sh [dev|prodtest]" >&2; exit 2 ;;
esac

if [[ ! -f "$ENV_FILE" || ! -f "$SQL_FILE" ]]; then
  echo "Missing .env or BMR schema SQL. Run from the correct checkout." >&2
  exit 1
fi

compose() {
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

if [[ -z "$(compose ps -q db)" ]]; then
  echo "The selected database container is not running ($TARGET)." >&2
  echo "Check: docker compose -f $COMPOSE_FILE --env-file $ENV_FILE ps" >&2
  exit 1
fi

db_psql() {
  compose exec -T db sh -c '
    export PGPASSWORD="$POSTGRES_PASSWORD"
    exec psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"
  ' -- "$@"
}

echo "== Database preflight: $TARGET =="
db_psql -Atc "SELECT 'database=' || current_database() || ', existing_products=' || COUNT(*) FROM products;"
db_psql -Atc "SELECT 'formula_table_exists=' || COALESCE(to_regclass('public.product_formula_versions')::text, 'NO');"

# Create a local PostgreSQL custom-format backup BEFORE applying any SQL.
BACKUP_DIR="$ROOT_DIR/Backups/bmr-schema-preflight"
mkdir -p "$BACKUP_DIR"
BACKUP_FILE="$(mktemp "$BACKUP_DIR/bmr_schema_$(date -u +%Y%m%dT%H%M%SZ)_XXXXXXXX.dump")"
chmod 600 "$BACKUP_FILE"
echo "Creating backup of existing $TARGET database..."
if ! compose exec -T db sh -c '
  export PGPASSWORD="$POSTGRES_PASSWORD"
  exec pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB"
' > "$BACKUP_FILE"; then
  rm -f "$BACKUP_FILE"
  echo "Backup failed; schema migration not attempted." >&2
  exit 1
fi
if [[ ! -s "$BACKUP_FILE" ]] || ! compose exec -T db pg_restore -l < "$BACKUP_FILE" >/dev/null; then
  rm -f "$BACKUP_FILE"
  echo "Backup verification failed; schema migration not attempted." >&2
  exit 1
fi
echo "Verified backup: $BACKUP_FILE"

echo "Applying ONLY db/init/130_product_formula_import.sql (single transaction)..."
db_psql --single-transaction -f - < "$SQL_FILE"

echo "== Database verification =="
db_psql -Atc "SELECT 'products_after=' || COUNT(*) FROM products;"
db_psql -Atc "SELECT 'formula_versions_table=' || to_regclass('public.product_formula_versions')::text;"
db_psql -Atc "SELECT 'formula_lines_table=' || to_regclass('public.product_formula_lines')::text;"
db_psql -Atc "SELECT 'bmr_storage_column=' || COUNT(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='bmr_storage_instructions';"
db_psql -Atc "SELECT 'registered_migration_permissions=' || COUNT(*) FROM permissions WHERE key IN ('data_migration.view','data_migration.commit');"
echo "Completed. No product, material, lot or transaction records were deleted."
echo "Sign out and back into StkFlo to refresh your permissions."
