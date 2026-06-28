#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/infra/docker-compose.yml"
ENV_FILE="$ROOT_DIR/.env"

# Always call compose the same way so env vars are always loaded
compose() {
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

echo "🔄 Restarting stack (NO volume deletion)…"

# Stop containers but keep all data and volumes intact
compose down

echo "🛠️  Rebuilding API image (no cache)…"
compose build --no-cache api

echo "🚀 Starting stack…"
compose up -d --force-recreate

echo "⏳ Waiting for containers to be healthy…"
for i in {1..60}; do
  # Use compose ps (so we don't hardcode container names)
  API_HEALTH="$(compose ps api --format '{{.Health}}' 2>/dev/null || true)"
  DB_HEALTH="$(compose ps db  --format '{{.Health}}' 2>/dev/null || true)"

  if [[ "$API_HEALTH" == "healthy" && "$DB_HEALTH" == "healthy" ]]; then
    echo "✅ Containers healthy."
    break
  fi

  if [[ $i -eq 60 ]]; then
    echo "❌ Timed out waiting for healthy containers."
    compose ps
    exit 1
  fi

  sleep 1
done

echo "🩺 Health checks:"

# Backend direct (container port)
curl -fsS http://localhost:8000/health || true
echo

# Nginx proxied route — retry because nginx can reset briefly during restart
for i in {1..10}; do
  if curl -fsS http://localhost:8080/api/health >/dev/null 2>&1; then
    curl -fsS http://localhost:8080/api/health || true
    echo
    break
  fi
  sleep 1
done

echo "✨ Done."