#!/usr/bin/env bash
set -euo pipefail

LOGIN_URL="${LOGIN_URL:-http://localhost:8080/admin/login}"
ME_URL="${ME_URL:-http://localhost:8080/admin/me}"

echo "🔐 Logging in at $LOGIN_URL …"

try_login() {
  curl -sS -X POST "$LOGIN_URL" \
    -H "Content-Type: application/json" \
    -d '{"username":"admin","password":"admin"}'
}

extract_token() {
  sed -E 's/.*"access_token":"([^"]+)".*/\1/'
}

RAW="$(try_login || true)"
if grep -q '"access_token"' <<<"$RAW"; then
  TOKEN="$(echo "$RAW" | extract_token)"
else
  echo "❌ Login failed. Attempting Argon2 repair for admin hash…"

  ARGON_HASH="$(docker exec -i infra-api-1 python - <<'PY'
from passlib.context import CryptContext
pwd = CryptContext(schemes=["argon2"], deprecated="auto")
print(pwd.hash("admin"))
PY
  )"

  if [[ -z "${ARGON_HASH// }" ]]; then
    echo "❌ Could not generate Argon2 hash inside container."
    echo "Raw login response was: $RAW"
    exit 1
  fi

  echo "🔧 Updating DB with Argon2 hash for admin…"
  docker exec -i infra-db-1 psql -U bmr -d bmr -c \
    "UPDATE users SET password_hash='${ARGON_HASH}', active=true WHERE username='admin';" >/dev/null

  echo "🔁 Retrying login…"
  RAW="$(try_login || true)"
  if ! grep -q '"access_token"' <<<"$RAW"; then
    echo "❌ Still cannot login. Raw response:"
    echo "$RAW"
    exit 1
  fi
  TOKEN="$(echo "$RAW" | extract_token)"
fi

echo "✅ Token captured:"
echo "$TOKEN"

echo "👤 Calling /admin/me …"
curl -sS "$ME_URL" -H "Authorization: Bearer $TOKEN"
echo

# save token and export line for easy reuse
mkdir -p .cache
echo "$TOKEN" > .cache/token.txt
echo "export TOKEN='$TOKEN'" > .cache/token.env

source .cache/token.env
echo "TOKEN length: ${#TOKEN}"   # should be > 0
curl -s "http://localhost:8080/admin/me" -H "Authorization: Bearer $TOKEN"

echo "💾 Saved token to .cache/token.txt and .cache/token.env"

echo "✨ Login test complete."
