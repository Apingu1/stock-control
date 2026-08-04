#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CERT_DIR="$ROOT_DIR/infra/certs"
HOSTNAME_VALUE="${1:-stock-control.test}"
IP_ADDRESS="${2:-}"
RENEW_BEFORE_DAYS="${3:-90}"
SERVER_CERT="$CERT_DIR/stock-control.crt"
CA_CERT="$CERT_DIR/stock-control-ca.crt"

seconds=$((RENEW_BEFORE_DAYS * 86400))
renew=0

if [[ ! -s "$SERVER_CERT" || ! -s "$CA_CERT" ]]; then
  renew=1
elif ! openssl x509 -checkend "$seconds" -noout -in "$SERVER_CERT" >/dev/null 2>&1; then
  renew=1
fi

if [[ "$renew" -eq 1 ]]; then
  echo "Server certificate is missing or expires within ${RENEW_BEFORE_DAYS} days. Renewing."
  bash "$ROOT_DIR/scripts/generate_test_tls_cert.sh" "$HOSTNAME_VALUE" "$IP_ADDRESS"
  echo "CERTIFICATE_RENEWED=1"
else
  expiry="$(openssl x509 -enddate -noout -in "$SERVER_CERT" | cut -d= -f2-)"
  echo "Server certificate remains valid beyond ${RENEW_BEFORE_DAYS} days: ${expiry}"
  echo "CERTIFICATE_RENEWED=0"
fi

ca_expiry="$(openssl x509 -enddate -noout -in "$CA_CERT" | cut -d= -f2-)"
echo "Private CA expiry: ${ca_expiry}"
