#!/usr/bin/env bash
# Apply the additive flavouring migration to an existing active StkFlo database.
# Take a verified backup first, never rebuild or reset the stock ledger.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:-dev}"
case "$TARGET" in
  dev) COMPOSE="$ROOT/infra/docker-compose.yml" ;;
  prodtest) COMPOSE="$ROOT/infra/docker-compose.production.yml" ;;
  *) echo "Usage: bash scripts/apply_flavouring_schema.sh [dev|prodtest]" >&2; exit 2 ;;
esac
[[ -r "$ROOT/.env" ]] || { echo "Missing .env" >&2; exit 1; }
SQL="$ROOT/db/init/131_flavouring_formula_slots.sql"
[[ -r "$SQL" ]] || { echo "Missing SQL migration" >&2; exit 1; }
compose() { docker compose -f "$COMPOSE" --env-file "$ROOT/.env" "$@"; }
[[ -n "$(compose ps -q db)" && -n "$(compose ps -q api)" ]] || {
  echo "Start the existing DB and API containers first" >&2; exit 1;
}
ACTIVE_DB="$(compose exec -T api python -c 'from app.db import get_active_db_name; print(get_active_db_name())' | tr -d '\r\n')"
[[ "$ACTIVE_DB" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || {
  echo "Could not establish a safe active DB name" >&2; exit 1;
}
db() {
  compose exec -T -e "STKFLO_TARGET_DB=$ACTIVE_DB" db sh -eu -c '
    export PGPASSWORD="$POSTGRES_PASSWORD"
    exec "$@"
  ' sh "$@"
}
BACKUP_DIR="$ROOT/Backups/flavouring-schema-preflight"
mkdir -p "$BACKUP_DIR"
BACKUP="$BACKUP_DIR/flavouring_${ACTIVE_DB}_$(date -u +%Y%m%dT%H%M%SZ).dump"
echo "Backing up active database: $ACTIVE_DB"
db pg_dump -Fc -U "$(compose exec -T db sh -c 'printf %s "$POSTGRES_USER"')" -d "$ACTIVE_DB" > "$BACKUP"
[[ -s "$BACKUP" ]] && compose exec -T db pg_restore -l < "$BACKUP" >/dev/null || {
  echo "Backup verification failed; migration NOT applied." >&2; exit 1;
}
echo "Verified backup: $BACKUP"
DB_USER="$(compose exec -T db sh -c 'printf %s "$POSTGRES_USER"')"
db psql -X -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$ACTIVE_DB" < "$SQL"
db psql -X -v ON_ERROR_STOP=1 -Atc "SELECT category_code, type_code, threshold_days FROM expiry_threshold_settings WHERE category_code='FLAVOURING' AND type_code='NA';" -U "$DB_USER" -d "$ACTIVE_DB"
echo "Flavouring migration completed without deleting inventory or transactions."
