#!/usr/bin/env bash
set -euo pipefail

SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPTS_DIR/.." && pwd)"

COMPOSE_FILE="$ROOT_DIR/infra/docker-compose.yml"
INIT_SQL="$ROOT_DIR/db/init/phase-1b_lots_and_txn.sql"

# Load DB env vars if present
if [[ -f "$ROOT_DIR/.env" ]]; then
  # shellcheck disable=SC2046
  export $(grep -E '^(DB_NAME|DB_USER)=' "$ROOT_DIR/.env")
fi

DB_NAME="${DB_NAME:-stock}"
DB_USER="${DB_USER:-stock}"

if [[ ! -f "$INIT_SQL" ]]; then
  echo "❌ Init SQL not found at: $INIT_SQL"
  exit 1
fi

echo "⚠️  This script will DROP the Postgres volume and reseed the schema."
echo "    Database: $DB_NAME (user: $DB_USER)"
echo "    Init SQL: $INIT_SQL"
echo

echo "🔧 Bringing stack down (INCLUDING volumes)…"
docker compose -f "$COMPOSE_FILE" down -v || true

echo "🏗️  Building API image (no cache)…"
docker compose -f "$COMPOSE_FILE" build --no-cache api

echo "🐘 Starting DB container only…"
docker compose --env-file "$ROOT_DIR/.env" -f "$COMPOSE_FILE" up -d db

echo "⏳ Waiting for DB container to be healthy…"
for i in {1..40}; do
  STATE_DB=$(docker ps --filter "name=infra-db-1" --format "{{.Status}}" || true)
  if [[ "$STATE_DB" == *"(healthy)"* ]]; then
    echo "✅ DB container is healthy."
    break
  fi
  if [[ $i -eq 40 ]]; then
    echo "❌ Timed out waiting for DB to become healthy."
    docker ps
    exit 1
  fi
  sleep 1
done

echo "📜 Applying schema from $INIT_SQL …"
docker exec -i infra-db-1 psql -U "$DB_USER" -d "$DB_NAME" < "$INIT_SQL"

echo "🚀 Starting full stack (API + others)…"
docker compose --env-file "$ROOT_DIR/.env" -f "$COMPOSE_FILE" up -d --force-recreate

echo "⏳ Waiting for API and DB containers to be healthy…"
for i in {1..40}; do
  STATE_API=$(docker ps --filter "name=infra-api-1" --format "{{.Status}}" || true)
  STATE_DB=$(docker ps --filter "name=infra-db-1"  --format "{{.Status}}" || true)
  if [[ "$STATE_API" == *"(healthy)"* && "$STATE_DB" == *"(healthy)"* ]]; then
    echo "✅ Containers healthy."
    break
  fi
  if [[ $i -eq 40 ]]; then
    echo "❌ Timed out waiting for healthy containers."
    docker compose -f "$COMPOSE_FILE" ps
    exit 1
  fi
  sleep 1
done

echo "🩺 Health checks:"
curl -sS http://localhost:8000/health || true
echo
curl -sS http://localhost:8080/health || true
echo
echo "✨ Done. Stack rebuilt with fresh DB + schema."
