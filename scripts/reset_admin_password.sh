#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

COMPOSE="infra/docker-compose.yml"
ENV_FILE=".env"

DEFAULT_PASSWORD="Admin123!"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $ROOT/.env not found. Create it (or copy from .env.example) before running."
  exit 1
fi

# Load env so DB_NAME/DB_USER/DB_PASSWORD are available if you need them later.
set -a
# shellcheck disable=SC1091
source "$ENV_FILE"
set +a

# Generate bcrypt hash inside API container (ensures same hashing libs as backend)
HASH="$(docker compose -f "$COMPOSE" exec -T api python - <<PY
from passlib.hash import bcrypt
print(bcrypt.hash("${DEFAULT_PASSWORD}"))
PY
)"

if [ -z "$HASH" ]; then
  echo "ERROR: Failed to generate password hash."
  exit 1
fi

# Update admin password in DB.
# NOTE: column name assumed to be password_hash (matches your current schema).
docker compose -f "$COMPOSE" exec -T db \
  psql -U "${DB_USER:-stock}" -d "${DB_NAME:-stock}" \
  -v ON_ERROR_STOP=1 \
  -c "UPDATE users SET password_hash = '${HASH}' WHERE username='admin';"

echo "SUCCESS: admin password reset to: ${DEFAULT_PASSWORD}"
