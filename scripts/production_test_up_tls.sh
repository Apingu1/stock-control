#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_COMPOSE="$ROOT_DIR/infra/docker-compose.production.yml"
TLS_COMPOSE="$ROOT_DIR/infra/docker-compose.production.tls.yml"
ENV_FILE="$ROOT_DIR/.env"

for required in   "$ROOT_DIR/infra/certs/stock-control.crt"   "$ROOT_DIR/infra/certs/stock-control.key"; do
  if [[ ! -f "$required" ]]; then
    echo "ERROR: Missing TLS file: $required"
    echo "Run scripts/generate_test_tls_cert.sh first."
    exit 1
  fi
done

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE does not exist."
  exit 1
fi

mkdir -p "$ROOT_DIR/Backups" "$ROOT_DIR/runtime-state"

compose() {
  docker compose     -f "$BASE_COMPOSE"     -f "$TLS_COMPOSE"     --env-file "$ENV_FILE"     "$@"
}

echo "Building and starting the isolated HTTPS production-test stack..."
compose up -d --build

PUBLISHED_HTTPS="$(compose port web 443 | tail -n 1)"
APP_HTTPS_PORT="${PUBLISHED_HTTPS##*:}"

if [[ -z "$APP_HTTPS_PORT" ]]; then
  echo "ERROR: Could not determine the published HTTPS port."
  compose ps
  exit 1
fi

echo "Waiting for the HTTPS endpoint on port ${APP_HTTPS_PORT}..."
for i in {1..90}; do
  if curl -kfsS "https://127.0.0.1:${APP_HTTPS_PORT}/api/health" >/dev/null 2>&1; then
    echo "HTTPS production test is ready: https://127.0.0.1:${APP_HTTPS_PORT}"
    echo "Use the hostname included in the certificate from operator PCs."
    compose ps
    exit 0
  fi
  sleep 2
done

echo "ERROR: HTTPS production-test stack did not become ready."
compose ps
compose logs --tail=150
exit 1
