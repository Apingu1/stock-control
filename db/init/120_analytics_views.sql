-- db/init/120_analytics_views.sql
-- Analytics views (traceable, drill-down friendly)
-- NOTE: uses Europe/London month bucketing for consistent "calendar month" reporting.

BEGIN;

-- Helper: normalize month bucket in UK local time
-- date_trunc returns timestamp without tz when using AT TIME ZONE.
-- We store month_bucket as DATE (first day of month).

DROP VIEW IF EXISTS analytics_monthly_kpis CASCADE;
CREATE VIEW analytics_monthly_kpis AS
SELECT
  (date_trunc('month', st.created_at AT TIME ZONE 'Europe/London'))::date AS month_bucket,
  COALESCE(SUM(CASE WHEN st.txn_type = 'RECEIPT' THEN st.total_value ELSE 0 END), 0)::numeric(18,6) AS receipt_total_value,
  COALESCE(SUM(CASE WHEN st.txn_type = 'ISSUE'   THEN st.total_value ELSE 0 END), 0)::numeric(18,6) AS issue_total_value,
  COUNT(*) FILTER (WHERE st.txn_type = 'RECEIPT') AS receipt_txn_count,
  COUNT(*) FILTER (WHERE st.txn_type = 'ISSUE')   AS issue_txn_count,
  COUNT(DISTINCT st.product_batch_no) FILTER (WHERE st.txn_type = 'ISSUE' AND st.product_batch_no IS NOT NULL) AS unique_batches_issued
FROM stock_transactions st
GROUP BY 1
ORDER BY 1;

DROP VIEW IF EXISTS analytics_product_batch_frequency CASCADE;
CREATE VIEW analytics_product_batch_frequency AS
SELECT
  st.es_product_code,
  COUNT(DISTINCT st.product_batch_no) AS unique_batch_count,
  MAX(st.created_at) AS last_issue_at
FROM stock_transactions st
WHERE st.txn_type = 'ISSUE'
  AND st.es_product_code IS NOT NULL
  AND st.product_batch_no IS NOT NULL
GROUP BY st.es_product_code
ORDER BY unique_batch_count DESC, st.es_product_code;

DROP VIEW IF EXISTS analytics_product_batches_cost CASCADE;
CREATE VIEW analytics_product_batches_cost AS
SELECT
  st.es_product_code,
  st.product_batch_no,
  COALESCE(SUM(st.total_value), 0)::numeric(18,6) AS batch_total_cost,
  COUNT(*) AS issue_txn_count,
  MIN(st.created_at) AS first_issue_at,
  MAX(st.created_at) AS last_issue_at
FROM stock_transactions st
WHERE st.txn_type = 'ISSUE'
  AND st.es_product_code IS NOT NULL
  AND st.product_batch_no IS NOT NULL
GROUP BY st.es_product_code, st.product_batch_no;

DROP VIEW IF EXISTS analytics_batch_materials CASCADE;
CREATE VIEW analytics_batch_materials AS
SELECT
  st.id AS stock_txn_id,
  st.created_at,
  st.created_by,

  st.es_product_code,
  st.product_batch_no,

  m.material_code,
  m.name AS material_name,

  ml.lot_number,

  st.qty,
  st.uom_code,
  st.unit_price,
  st.total_value,

  st.material_lot_id
FROM stock_transactions st
JOIN material_lots ml ON ml.id = st.material_lot_id
JOIN materials m ON m.id = ml.material_id
WHERE st.txn_type = 'ISSUE'
  AND st.product_batch_no IS NOT NULL;

DROP VIEW IF EXISTS analytics_material_monthly CASCADE;
CREATE VIEW analytics_material_monthly AS
SELECT
  m.material_code,
  m.name AS material_name,
  (date_trunc('month', st.created_at AT TIME ZONE 'Europe/London'))::date AS month_bucket,

  COALESCE(SUM(CASE WHEN st.txn_type = 'ISSUE' THEN st.qty ELSE 0 END), 0)::numeric(18,6) AS issue_qty_sum,
  COALESCE(SUM(CASE WHEN st.txn_type = 'ISSUE' THEN st.total_value ELSE 0 END), 0)::numeric(18,6) AS issue_value_sum,

  COALESCE(SUM(CASE WHEN st.txn_type = 'RECEIPT' THEN st.qty ELSE 0 END), 0)::numeric(18,6) AS receipt_qty_sum,
  COALESCE(SUM(CASE WHEN st.txn_type = 'RECEIPT' THEN st.total_value ELSE 0 END), 0)::numeric(18,6) AS receipt_value_sum,

  COUNT(*) FILTER (WHERE st.txn_type = 'ISSUE') AS issue_txn_count,
  COUNT(*) FILTER (WHERE st.txn_type = 'RECEIPT') AS receipt_txn_count
FROM stock_transactions st
JOIN material_lots ml ON ml.id = st.material_lot_id
JOIN materials m ON m.id = ml.material_id
GROUP BY m.material_code, m.name, 3
ORDER BY m.material_code, month_bucket;

COMMIT;
