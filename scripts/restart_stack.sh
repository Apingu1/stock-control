#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "🔄 Restarting stack (NO volume deletion)…"

# Stop containers but keep all data and volumes intact
docker compose -f "$ROOT_DIR/infra/docker-compose.yml" down

echo "🛠️  Rebuilding API image (no cache)…"
docker compose -f "$ROOT_DIR/infra/docker-compose.yml" build --no-cache api

echo "🚀 Starting stack…"
docker compose --env-file "$ROOT_DIR/.env" \
  -f "$ROOT_DIR/infra/docker-compose.yml" up -d --force-recreate

echo "⏳ Waiting for containers to be healthy…"
for i in {1..40}; do
  STATE_API=$(docker ps --filter "name=infra-api-1" --format "{{.Status}}" || true)
  STATE_DB=$(docker ps --filter "name=infra-db-1"  --format "{{.Status}}" || true)

  if [[ "$STATE_API" == *"(healthy)"* && "$STATE_DB" == *"(healthy)"* ]]; then
    echo "✅ Containers healthy."
    break
  fi

  if [[ $i -eq 40 ]]; then
    echo "❌ Timed out waiting for healthy containers."
    docker compose -f "$ROOT_DIR/infra/docker-compose.yml" ps
    exit 1
  fi
  sleep 1
done

echo "🩺 Health checks:"
curl -sS http://localhost:8000/health || true
echo
curl -sS http://localhost:8080/health || true
echo

echo "✨ Done."
