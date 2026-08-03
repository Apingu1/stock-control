#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_COMPOSE="$ROOT_DIR/infra/docker-compose.production.yml"
TLS_COMPOSE="$ROOT_DIR/infra/docker-compose.production.tls.yml"
ENV_FILE="$ROOT_DIR/.env"

base_compose() {
  docker compose -f "$BASE_COMPOSE" --env-file "$ENV_FILE" "$@"
}

tls_compose() {
  docker compose -f "$BASE_COMPOSE" -f "$TLS_COMPOSE" --env-file "$ENV_FILE" "$@"
}

base_compose ps

HTTP_BINDING="$(base_compose port web 80 2>/dev/null | tail -n 1 || true)"
if [[ -n "$HTTP_BINDING" ]]; then
  HTTP_PORT="${HTTP_BINDING##*:}"
  echo
  echo "HTTP checks on port ${HTTP_PORT}:"
  curl -fsS "http://127.0.0.1:${HTTP_PORT}/api/health" && echo
  curl -fsS "http://127.0.0.1:${HTTP_PORT}/manifest.webmanifest" | head -c 300 && echo
fi

HTTPS_BINDING="$(tls_compose port web 443 2>/dev/null | tail -n 1 || true)"
if [[ -n "$HTTPS_BINDING" ]]; then
  HTTPS_PORT="${HTTPS_BINDING##*:}"
  echo
  echo "HTTPS check on port ${HTTPS_PORT}:"
  curl -kfsS "https://127.0.0.1:${HTTPS_PORT}/api/health" && echo
fi
