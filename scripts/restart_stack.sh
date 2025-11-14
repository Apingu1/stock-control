#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR/infra"
docker compose down          # no -v, keep data
docker compose up -d --build

echo "🩺 Health check:"
curl -s http://localhost:8080/health || true
echo
