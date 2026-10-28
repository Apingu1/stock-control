#!/usr/bin/env bash
# Update the active Codespaces TEST database in place. No database reset.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE="$ROOT/infra/docker-compose.yml"
ENV_FILE="$ROOT/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: Missing .env. No changes applied." >&2
  exit 1
fi

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

if [[ -z "$(compose ps -q db)" || -z "$(compose ps -q api)" ]]; then
  echo "ERROR: Start the existing API and DB first: bash scripts/restart_stack.sh" >&2
  exit 1
fi

# The app can switch databases; use its actual active dataset, not .env DB_NAME.
ACTIVE_DB="$(compose exec -T api python -c 'from app.db import get_active_db_name; print(get_active_db_name())' | tr -d '\r\n')"
if [[ ! "$ACTIVE_DB" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
  echo "ERROR: Unsafe active database name: $ACTIVE_DB" >&2
  exit 1
fi

echo "StkFlo test DB: $ACTIVE_DB"
echo "No stock, audit events, containers or Docker volumes will be deleted."

db_psql() {
  compose exec -T -e "STKFLO_TARGET_DB=$ACTIVE_DB" db sh -eu -c \
    'exec psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$STKFLO_TARGET_DB" "$@"' \
    sh "$@"
}

db_sql_file() {
  local filename="$1"
  [[ -r "$ROOT/db/init/$filename" ]] || { echo "Missing $filename" >&2; exit 1; }
  echo "Applying $filename..."
  db_psql < "$ROOT/db/init/$filename"
}

echo "Checking active database and quantity precision..."
db_psql -Atc "SELECT current_database() || ' | material rows=' || count(*) FROM materials;"
QTY_SCALE="$(db_psql -Atc "SELECT numeric_scale FROM information_schema.columns WHERE table_schema='public' AND table_name='stock_transactions' AND column_name='qty';" | tr -d '\r\n')"
if [[ "$QTY_SCALE" != "6" ]]; then
  echo "ERROR: stock_transactions.qty has scale=$QTY_SCALE (expected 6)." >&2
  echo "This patch does not alter historical transaction quantities. Fix precision separately." >&2
  exit 1
fi

# Migration 129 is idempotent: seeds NA, AMP and UNIT; updates Packaging,
# the Cancelled BMR system marker and the one-day Packaging expiry policy.
db_sql_file "129_stkflo_classification.sql"

# Replace the old lot-cost view which mistakenly counts STATUS_MOVE receipts.
# New basis: SUM(Goods Receipt value) / SUM(Goods Receipt base-UOM quantity),
# across all status segments of the same physical lot.
db_sql_file "114_lot_balances_cost_columns.sql"

# Re-bind the compatibility wrapper (no data changes).
db_psql -c "CREATE OR REPLACE VIEW v_lot_balances AS SELECT * FROM lot_balances_view;"

echo "Checking required lookups and cost view..."
db_psql <<'SQL'
DO $check$
DECLARE
  missing text;
  view_sql text;
BEGIN
  SELECT string_agg(kind || ':' || code, ', ') INTO missing
  FROM (VALUES ('type', 'NA'), ('uom', 'UNIT'), ('uom', 'AMP')) v(kind,code)
  WHERE (kind = 'type' AND NOT EXISTS (SELECT 1 FROM material_types WHERE material_types.code = v.code))
     OR (kind = 'uom' AND NOT EXISTS (SELECT 1 FROM uoms WHERE uoms.code = v.code));
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Missing lookup codes: %', missing;
  END IF;
  SELECT pg_get_viewdef('lot_balances_view'::regclass, true) INTO view_sql;
  IF position('RECEIPT' in view_sql) = 0 OR position('lot_costs' in view_sql) = 0 THEN
    RAISE EXCEPTION 'Expected receipt-based lot valuation view is not installed';
  END IF;
  RAISE NOTICE 'Required lookup codes and physical-lot valuation logic verified';
END
$check$;

-- Print a reconciliation for every current physical lot (up to 30).
WITH receipt_bases AS (
  SELECT ml.material_id, ml.lot_number,
         SUM(st.qty) AS received_qty,
         SUM(COALESCE(st.total_value, st.unit_price * st.qty, 0)) AS received_cost
  FROM stock_transactions st
  JOIN material_lots ml ON ml.id = st.material_lot_id
  WHERE st.txn_type = 'RECEIPT'
  GROUP BY ml.material_id, ml.lot_number
)
SELECT m.material_code, r.lot_number, m.base_uom_code,
       r.received_qty,
       ROUND(r.received_cost, 2) AS goods_receipt_cost_gbp,
       ROUND(r.received_cost / NULLIF(r.received_qty, 0), 6) AS cost_per_base_uom_gbp,
       SUM(v.balance_qty) AS current_quantity,
       ROUND(SUM(v.lot_value), 2) AS live_lot_value_gbp
FROM receipt_bases r
JOIN materials m ON m.id = r.material_id
JOIN material_lots ml ON ml.material_id = r.material_id AND ml.lot_number = r.lot_number
JOIN lot_balances_view v ON v.material_lot_id = ml.id
GROUP BY m.material_code, r.lot_number, m.base_uom_code, r.received_qty, r.received_cost
ORDER BY m.material_code, r.lot_number
LIMIT 30;
SQL

echo "SUCCESS: StkFlo active test DB updated without deleting data."
echo "If MAT0001 received 100 MG for GBP100, its unit cost is GBP1/MG."
