#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CERT_DIR="$ROOT_DIR/infra/certs"
HOSTNAME_VALUE="${1:-stock-control.local}"
IP_ADDRESS="${2:-}"

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

SAN="DNS:${HOSTNAME_VALUE}"
if [[ -n "$IP_ADDRESS" ]]; then
  SAN="${SAN},IP:${IP_ADDRESS}"
fi

cat > "$EXT_FILE" <<EOF
subjectAltName=${SAN}
extendedKeyUsage=serverAuth
keyUsage=digitalSignature,keyEncipherment
basicConstraints=CA:FALSE
EOF

openssl genrsa -out "$CA_KEY" 4096
openssl req -x509 -new -nodes   -key "$CA_KEY"   -sha256   -days 3650   -subj "/C=GB/O=Eaststone/OU=Stock Control Test/CN=Eaststone Stock Control Test CA"   -out "$CA_CERT"

openssl genrsa -out "$SERVER_KEY" 2048
openssl req -new   -key "$SERVER_KEY"   -subj "/C=GB/O=Eaststone/OU=Stock Control Test/CN=${HOSTNAME_VALUE}"   -out "$SERVER_CSR"

openssl x509 -req   -in "$SERVER_CSR"   -CA "$CA_CERT"   -CAkey "$CA_KEY"   -CAcreateserial   -out "$SERVER_CERT"   -days 825   -sha256   -extfile "$EXT_FILE"

rm -f "$SERVER_CSR" "$EXT_FILE" "$CERT_DIR/stock-control-ca.srl"
chmod 600 "$CA_KEY" "$SERVER_KEY"
chmod 644 "$CA_CERT" "$SERVER_CERT"

echo "Generated test TLS certificate for: ${HOSTNAME_VALUE}"
[[ -n "$IP_ADDRESS" ]] && echo "Included IP address: ${IP_ADDRESS}"
echo "Install this CA certificate on each test PC:"
echo "  $CA_CERT"
echo "Keep these private keys on the server only:"
echo "  $CA_KEY"
echo "  $SERVER_KEY"
