#!/usr/bin/env bash
# Apply the additive flavouring migration to an existing active database.
# Run after backup and before starting a new API build. Never resets stock.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:-dev}"
case "$TARGET" in
  dev) COMPOSE="$ROOT/infra/docker-compose.yml" ;;
  prodtest) COMPOSE="$ROOT/infra/docker-compose.production.yml" ;;
  *) echo "Usage: bash scripts/apply_flavouring_schema.sh [dev|prodtest]" >&2; exit 2 ;;
esac
[[ -r "$ROOT/.env" ]] || { echo "Missing .env" >&2; exit 1; }
[[ -r "$ROOT/db/init/131_flavouring_formula_slots.sql" ]] || { echo "Missing SQL migration" >&2; exit 1; }
compose() { docker compose -f "$COMPOSE" --env-file "$ROOT/.env" "$@"; }
[[ -n "$(compose ps -q db)" ]] || { echo "Database container is not running" >&2; exit 1; }
BACKUP_DIR="$ROOT/Backups/flavouring-schema-preflight"
mkdir -p "$BACKUP_DIR"
BACKUP="$BACKUP_DIR/flavouring_$(date -u +%Y%m%dT%H%M%SZ).dump"
compose exec -T db sh -c 'export PGPASSWORD="$POSTGRES_PASSWORD"; pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$BACKUP"
[[ -s "$BACKUP" ]] && compose exec -T db pg_restore -l < "$BACKUP" > /dev/null || { echo "Backup verification failed, no SQL applied" >&2; exit 1; }
echo "Backup verified: $BACKUP"
compose exec -T db sh -c 'export PGPASSWORD="$POSTGRES_PASSWORD"; exec psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$ROOT/db/init/131_flavouring_formula_slots.sql"
echo "Flavouring migration applied. No stock transactions were altered."
