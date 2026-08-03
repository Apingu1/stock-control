#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/infra/docker-compose.production.yml"
ENV_FILE="$ROOT_DIR/.env"
APP_HTTP_PORT="${APP_HTTP_PORT:-8080}"
APP_HTTPS_PORT="${APP_HTTPS_PORT:-8443}"

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps

echo
echo "HTTP checks:"
curl -fsS "http://127.0.0.1:${APP_HTTP_PORT}/api/health" && echo
curl -fsS "http://127.0.0.1:${APP_HTTP_PORT}/manifest.webmanifest" | head -c 300 && echo

echo
echo "HTTPS check (only when TLS override is running):"
curl -kfsS "https://127.0.0.1:${APP_HTTPS_PORT}/api/health" && echo || true
