#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/infra/docker-compose.production.yml"
ENV_FILE="$ROOT_DIR/.env"

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" down

echo "Production-test containers stopped."
echo "Database volume stock-control-prodtest-db-data was preserved."
