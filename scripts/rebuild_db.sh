#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

COMPOSE="infra/docker-compose.yml"

# Load env (no changes to file)
ENV_FILE=".env"
if [ ! -f "$ENV_FILE" ]; then
  if [ -f ".env.example" ]; then ENV_FILE=".env.example"
  elif [ -f "env.txt" ]; then ENV_FILE="env.txt"
  else
    echo "ERROR: No .env/.env.example/env.txt found."
    exit 1
  fi
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${DB_NAME:?DB_NAME missing}"
: "${DB_USER:?DB_USER missing}"
: "${DB_PASSWORD:?DB_PASSWORD missing}"

# Provide POSTGRES_* at runtime (compose expects these)
export POSTGRES_DB="$DB_NAME"
export POSTGRES_USER="$DB_USER"
export POSTGRES_PASSWORD="$DB_PASSWORD"

echo "=== Fresh rebuild (DB volume + schema) ==="
echo "Env: $ENV_FILE"
echo "DB_NAME=$DB_NAME DB_USER=$DB_USER"

# --- Temporarily disable docker-entrypoint auto init ordering ---
STAMP="$(date +%Y%m%d_%H%M%S)"
INIT_DIR="db/init"
BAK_DIR="db/init__bak_${STAMP}"

if [ ! -d "$INIT_DIR" ]; then
  echo "ERROR: Missing $INIT_DIR"
  exit 1
fi

echo "Temporarily moving $INIT_DIR -> $BAK_DIR (to prevent auto-init running in wrong order)"
mv "$INIT_DIR" "$BAK_DIR"
mkdir -p "$INIT_DIR"

restore_init_dir () {
  rm -rf "$INIT_DIR" || true
  mv "$BAK_DIR" "$INIT_DIR" || true
  echo "Restored $INIT_DIR"
}
trap restore_init_dir EXIT

# --- Hard reset stack + volumes ---
docker compose -f "$COMPOSE" down -v || true

# --- Start DB only ---
docker compose -f "$COMPOSE" up -d db
DB_CID="$(docker compose -f "$COMPOSE" ps -q db)"

# Wait for postgres itself (not app DB) to be ready
echo "Waiting for postgres..."
for i in $(seq 1 60); do
  if docker exec "$DB_CID" pg_isready -U postgres -d postgres >/dev/null 2>&1; then
    echo "Postgres is accepting connections."
    break
  fi
  sleep 2
  if [ "$i" -eq 60 ]; then
    echo "ERROR: Postgres did not become ready."
    docker compose -f "$COMPOSE" logs --tail=200 db || true
    exit 1
  fi
done

# Copy real init SQL into container /sql
docker exec "$DB_CID" mkdir -p /sql
docker cp "$BAK_DIR/." "$DB_CID:/sql"

psqlf () {
  local f="$1"
  if ! docker exec "$DB_CID" test -f "/sql/$f"; then
    echo "ERROR: Missing /sql/$f"
    exit 1
  fi
  echo ">>> APPLY $f"
  docker exec "$DB_CID" psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "/sql/$f"
}

# Apply phase scripts first (creates tables/views)
psqlf "phase-a_auth_users.sql"
psqlf "phase-1_materials.sql"
psqlf "phase-1b_lots_and_txn.sql"

# Avoid CREATE OR REPLACE VIEW rename conflict
docker exec "$DB_CID" psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -c "DROP VIEW IF EXISTS lot_balances_view CASCADE;"

psqlf "phase-1d_split_lots.sql"
psqlf "phase-b_roles_permissions.sql"
psqlf "phase-b_patch_001.sql"
psqlf "phase-b_patch_002_drop_role_check.sql"

# Apply numeric migrations
echo "Applying numeric migrations..."
for f in $(docker exec "$DB_CID" sh -lc "ls -1 /sql | grep -E '^[0-9]{3}_.*\\.sql$' | sort"); do
  echo ">>> APPLY $f"
  docker exec "$DB_CID" psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "/sql/$f"
done

# Start the rest of the stack
docker compose -f "$COMPOSE" up -d --build

echo "SUCCESS: DB rebuilt and stack started."
