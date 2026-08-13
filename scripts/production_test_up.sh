#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/infra/docker-compose.production.yml"
ENV_FILE="$ROOT_DIR/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE does not exist."
  echo "Copy .env.example to .env and replace the test secrets first."
  exit 1
fi

mkdir -p "$ROOT_DIR/Backups" "$ROOT_DIR/runtime-state"

compose() {
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

echo "Building and starting the isolated production-test stack..."
compose up -d --build

PUBLISHED_HTTP="$(compose port web 80 | tail -n 1)"
APP_HTTP_PORT="${PUBLISHED_HTTP##*:}"

if [[ -z "$APP_HTTP_PORT" ]]; then
  echo "ERROR: Could not determine the published HTTP port."
  compose ps
  exit 1
fi

echo "Waiting for the production-test web service on port ${APP_HTTP_PORT}..."
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
