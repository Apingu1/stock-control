#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/infra/docker-compose.production.yml"
ENV_FILE="$ROOT_DIR/.env"
APP_HTTP_PORT="${APP_HTTP_PORT:-8080}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE does not exist."
  echo "Copy .env.example to .env and replace the test secrets first."
  exit 1
fi

mkdir -p "$ROOT_DIR/backups-production-test"

compose() {
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

echo "Building and starting the isolated production-test stack..."
compose up -d --build

echo "Waiting for the production-test web service..."
for i in {1..90}; do
  if curl -fsS "http://127.0.0.1:${APP_HTTP_PORT}/api/health" >/dev/null 2>&1; then
    echo "Production test is ready: http://127.0.0.1:${APP_HTTP_PORT}"
    echo "Manifest: http://127.0.0.1:${APP_HTTP_PORT}/manifest.webmanifest"
    compose ps
    exit 0
  fi
  sleep 2
done

echo "ERROR: Production-test stack did not become ready."
compose ps
compose logs --tail=150
exit 1
