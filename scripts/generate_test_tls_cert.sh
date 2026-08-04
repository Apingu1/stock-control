#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CERT_DIR="$ROOT_DIR/infra/certs"
HOSTNAME_VALUE="${1:-stock-control.test}"
IP_ADDRESS="${2:-}"
FORCE_NEW_CA="${3:-}"

if ! command -v openssl >/dev/null 2>&1; then
  echo "ERROR: openssl is required."
  exit 1
fi

mkdir -p "$CERT_DIR"
umask 077

CA_KEY="$CERT_DIR/stock-control-ca.key"
CA_CERT="$CERT_DIR/stock-control-ca.crt"
SERVER_KEY="$CERT_DIR/stock-control.key"
SERVER_CSR="$CERT_DIR/stock-control.csr"
SERVER_CERT="$CERT_DIR/stock-control.crt"
EXT_FILE="$CERT_DIR/stock-control.ext"

SAN="DNS:${HOSTNAME_VALUE},DNS:localhost,IP:127.0.0.1"
if [[ -n "$IP_ADDRESS" ]]; then
  SAN="${SAN},IP:${IP_ADDRESS}"
fi

cat > "$EXT_FILE" <<EOF
subjectAltName=${SAN}
extendedKeyUsage=serverAuth
keyUsage=digitalSignature,keyEncipherment
basicConstraints=CA:FALSE
EOF

if [[ "$FORCE_NEW_CA" == "--new-ca" ]]; then
  stamp="$(date +%Y%m%d_%H%M%S)"
  [[ -f "$CA_KEY" ]] && mv "$CA_KEY" "$CERT_DIR/stock-control-ca-${stamp}.key.bak"
  [[ -f "$CA_CERT" ]] && mv "$CA_CERT" "$CERT_DIR/stock-control-ca-${stamp}.crt.bak"
fi

# The private customer CA is created once and then retained. Normal server
# certificate renewals continue to chain to this same trusted root, so client
# computers do not need the CA imported again for each renewal.
if [[ ! -s "$CA_KEY" || ! -s "$CA_CERT" ]]; then
  openssl genrsa -out "$CA_KEY" 4096
  openssl req -x509 -new -nodes \
    -key "$CA_KEY" \
    -sha256 \
    -days 10950 \
    -subj "/C=GB/O=Eaststone/OU=Stock Control/CN=Eaststone Stock Control Private CA" \
    -out "$CA_CERT"
  echo "Created a new 30-year private Stock Control CA."
else
  echo "Reusing the existing Stock Control private CA."
fi

# Issue a fresh server key and certificate. The automated renewal task calls
# this script before expiry while preserving the CA above.
openssl genrsa -out "$SERVER_KEY" 2048
openssl req -new \
  -key "$SERVER_KEY" \
  -subj "/C=GB/O=Eaststone/OU=Stock Control/CN=${HOSTNAME_VALUE}" \
  -out "$SERVER_CSR"

openssl x509 -req \
  -in "$SERVER_CSR" \
  -CA "$CA_CERT" \
  -CAkey "$CA_KEY" \
  -CAcreateserial \
  -out "$SERVER_CERT" \
  -days 825 \
  -sha256 \
  -extfile "$EXT_FILE"

rm -f "$SERVER_CSR" "$EXT_FILE" "$CERT_DIR/stock-control-ca.srl"
chmod 600 "$CA_KEY" "$SERVER_KEY"
chmod 644 "$CA_CERT" "$SERVER_CERT"

echo "Generated server TLS certificate for: ${HOSTNAME_VALUE}"
[[ -n "$IP_ADDRESS" ]] && echo "Included server IP address: ${IP_ADDRESS}"
echo "Public CA certificate for client deployment: $CA_CERT"
echo "Private keys retained on the server only: $CA_KEY and $SERVER_KEY"
